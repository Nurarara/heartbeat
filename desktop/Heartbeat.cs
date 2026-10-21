// Windows-only companion. Building/self-test never changes wallpaper or startup settings.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace HeartbeatDesktop {
 static class Program {
  public static readonly string Root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Heartbeat");
  public static readonly string Cache=Path.Combine(Root,"latest.jpg");
  public static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
  public static bool AllowedServer(string text) {Uri uri;return Uri.TryCreate(text,UriKind.Absolute,out uri)&&uri.UserInfo==""&&uri.AbsolutePath=="/"&&uri.Query==""&&uri.Fragment==""&&(uri.Scheme=="https"||uri.Scheme=="http"&&uri.IsLoopback);}
  public static string Mode(string[] args) {if(args.Length==0)return "config";string a=args[0].ToLowerInvariant();if(a=="--self-test")return "test";if(a=="/s"||a=="-s")return "screen";if(a.StartsWith("/p")||a.StartsWith("-p"))return "preview";return "config";}
  public static IntPtr PreviewHandle(string[] args) {if(args.Length==0)return IntPtr.Zero;string[] parts=args[0].Split(':');string raw=parts.Length>1?parts[1]:args.Length>1?args[1]:"";long value;return long.TryParse(raw,out value)&&value>0?new IntPtr(value):IntPtr.Zero;}
  public static bool NightSafe(Bitmap bitmap) {double sum=0;int bright=0;double crop=Math.Min(bitmap.Height,bitmap.Width*9.0/16);for(int y=0;y<20;y++)for(int x=0;x<32;x++){Color c=bitmap.GetPixel(Math.Min(bitmap.Width-1,(int)((x+.5)*bitmap.Width/32)),Math.Min(bitmap.Height-1,(int)(bitmap.Height/2.0+((y+.5)/20-.5)*crop)));double light=(.2126*c.R+.7152*c.G+.0722*c.B)/255;sum+=light;if(light>.8)bright++;}return sum/640<=.32&&bright/640.0<=.12;}
  public static Bitmap ReadPicture(string path) {using(var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)){using(var source=Image.FromStream(stream)){if(source.Width<512||source.Height<512||source.Width>4096||source.Height>4096)throw new Exception("Picture dimensions are invalid.");return new Bitmap(source);}}}
  [STAThread] static int Main(string[] args) {
   if(Mode(args)=="test") {try{SelfTest();Console.WriteLine("Heartbeat desktop self-tests passed. No settings changed.");return 0;}catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}}
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Directory.CreateDirectory(Root);
   if(Mode(args)=="screen"){var forms=new List<Saver>();foreach(var screen in Screen.AllScreens)forms.Add(new Saver(screen.Bounds,IntPtr.Zero));foreach(var form in forms)form.FormClosed+=(s,e)=>{foreach(var f in forms)if(!f.IsDisposed)f.Close();Application.ExitThread();};foreach(var form in forms)form.Show();Application.Run();}
   else if(Mode(args)=="preview"){IntPtr parent=PreviewHandle(args);if(parent!=IntPtr.Zero)Application.Run(new Saver(Rectangle.Empty,parent));}
   else Application.Run(new Companion());return 0;
  }
  static void SelfTest() {
   if(!AllowedServer("https://heartbeat.example")||!AllowedServer("http://localhost:5173")||!AllowedServer("http://127.0.0.1:5173")||AllowedServer("http://heartbeat.example")||AllowedServer("https://user:password@example.com")||AllowedServer("https://example.com/steal"))throw new Exception("Origin validation failed");
   if(Mode(new[]{"/s"})!="screen"||Mode(new[]{"/c"})!="config"||Mode(new[]{"/p:123"})!="preview"||PreviewHandle(new[]{"/p","123"}).ToInt64()!=123||PreviewHandle(new[]{"/p:bad"})!=IntPtr.Zero)throw new Exception("Screensaver arguments failed");
   using(var black=new Bitmap(64,64)){using(var g=Graphics.FromImage(black))g.Clear(Color.Black);if(!NightSafe(black))throw new Exception("Dark guard failed");using(var g=Graphics.FromImage(black))g.Clear(Color.White);if(NightSafe(black))throw new Exception("Bright guard failed");}
   byte[] plain=Encoding.UTF8.GetBytes("test-only-device-token"),encrypted=ProtectedData.Protect(plain,null,DataProtectionScope.CurrentUser);if(Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted,null,DataProtectionScope.CurrentUser))!="test-only-device-token")throw new Exception("DPAPI roundtrip failed");
  }
 }
 class Companion:Form {
  readonly TextBox server=new TextBox();readonly Label state=new Label();readonly Label pairing=new Label();readonly ComboBox monitor=new ComboBox();readonly CheckBox automatic=new CheckBox();readonly CheckBox create=new CheckBox();readonly Timer timer=new Timer();readonly HttpClient http;
  string origin="",token="",lastId="";bool busy=false;
  readonly string config=Path.Combine(Program.Root,"device.json"),backup=Path.Combine(Program.Root,"wallpaper-backup.json");
  public Companion() {
   Text="Heartbeat · Desktop companion";ClientSize=new Size(570,650);MinimumSize=new Size(530,650);BackColor=Color.FromArgb(18,31,25);ForeColor=Color.FromArgb(239,232,212);Font=new Font("Segoe UI",10);StartPosition=FormStartPosition.CenterScreen;
   var handler=new HttpClientHandler{AllowAutoRedirect=false};http=new HttpClient(handler){Timeout=TimeSpan.FromSeconds(30)};http.DefaultRequestHeaders.Add("User-Agent","Heartbeat-Desktop/0.1");
   var panel=new FlowLayoutPanel{Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,AutoScroll=true,Padding=new Padding(30)};Controls.Add(panel);
   panel.Controls.Add(new Label{Text="A little more at home.",Font=new Font("Georgia",25),AutoSize=true,Margin=new Padding(0,0,0,16)});
   panel.Controls.Add(new Label{Text="Connect your studio. Keep your latest moment close.",AutoSize=true,Margin=new Padding(0,0,0,18)});
   panel.Controls.Add(new Label{Text="Heartbeat application address",AutoSize=true});server.Width=490;server.Text="http://localhost:5173";panel.Controls.Add(server);
   panel.Controls.Add(Button("1. Request pairing code",async()=>{string value=server.Text.Trim().TrimEnd('/');if(!Program.AllowedServer(value))throw new Exception("Use HTTPS, or HTTP only for localhost development. Enter the application origin without a path.");origin=value;token="";var d=await Call("device/start",true,false);token=Get(d,"token");pairing.Text="Approve code "+Get(d,"code")+" in Studio → Desktop companion.";Save();}));
   pairing.AutoSize=false;pairing.Width=490;pairing.Height=45;panel.Controls.Add(pairing);
   panel.Controls.Add(Button("2. Download latest picture",async()=>{await Download();}));
   panel.Controls.Add(Button("Request a new picture (uses allowance)",async()=>{var result=await Call("device/refresh",true,true);state.Text="Picture requested. Preparing in the background; download it shortly.";}));
   monitor.DropDownStyle=ComboBoxStyle.DropDownList;monitor.Width=490;monitor.Items.Add("All displays");for(int i=0;i<Screen.AllScreens.Length;i++)monitor.Items.Add("Display "+(i+1));monitor.SelectedIndex=0;panel.Controls.Add(monitor);
   panel.Controls.Add(Button("3. Apply wallpaper",async()=>{await Task.Yield();Apply();state.Text="Wallpaper applied. Your previous settings can be restored below.";}));
   panel.Controls.Add(Button("Restore previous wallpaper",async()=>{await Task.Yield();Restore();}));
   automatic.Text="Keep wallpaper updated (every 15 minutes)";automatic.AutoSize=true;automatic.Margin=new Padding(0,16,0,4);automatic.CheckedChanged+=(s,e)=>{if(automatic.Checked)timer.Start();else timer.Stop();};panel.Controls.Add(automatic);
   create.Text="Also request new pictures (uses your allowance)";create.AutoSize=true;panel.Controls.Add(create);
   panel.Controls.Add(Button("Open your studio",async()=>{await Task.Yield();string address=origin!=""?origin:server.Text.Trim().TrimEnd('/');if(!Program.AllowedServer(address))throw new Exception("Choose a valid application address.");System.Diagnostics.Process.Start(address+"/app?tab=desktop");}));
   state.AutoSize=false;state.Width=490;state.Height=80;state.Text="No wallpaper or startup settings change until you choose Apply.";panel.Controls.Add(state);
   timer.Interval=15*60000;timer.Tick+=async(s,e)=>await Work(async()=>{if(create.Checked)await Call("device/refresh",true,true);await Download();Apply();});
   FormClosed+=(s,e)=>{timer.Stop();timer.Dispose();http.Dispose();};LoadConfig();
  }
  Button Button(string text,Func<Task> action) {var b=new Button{Text=text,AutoSize=false,Width=490,Height=38,FlatStyle=FlatStyle.Flat,BackColor=Color.FromArgb(37,56,42),ForeColor=ForeColor,Margin=new Padding(0,7,0,0)};b.Click+=async(s,e)=>await Work(action);return b;}
  async Task Work(Func<Task> action){if(busy)return;busy=true;try{state.Text="One quiet moment…";await action();}catch(Exception e){state.Text=e.Message;}finally{busy=false;}}
  static string Get(Dictionary<string,object> data,string key){object value;return data.TryGetValue(key,out value)&&value!=null?Convert.ToString(value):"";}
  async Task<Dictionary<string,object>> Call(string path,bool post,bool authorized){if(!Program.AllowedServer(origin))throw new Exception("Choose a valid application address.");if(authorized&&token=="")throw new Exception("Pair this desktop first.");using(var request=new HttpRequestMessage(post?HttpMethod.Post:HttpMethod.Get,origin+"/api/product/"+path)){request.Headers.Add("Origin",origin);if(authorized)request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token);if(post)request.Content=new StringContent("{}",Encoding.UTF8,"application/json");using(var response=await http.SendAsync(request)){string body=await response.Content.ReadAsStringAsync();if(body.Length>65536)throw new Exception("Application response was too large.");Dictionary<string,object> data;try{data=Program.Json.Deserialize<Dictionary<string,object>>(body);}catch{throw new Exception("The application returned an unreadable response.");}if(!response.IsSuccessStatusCode)throw new Exception(Get(data,"error")!=""?Get(data,"error"):Get(data,"reason")!=""?Get(data,"reason"):"The application is unavailable.");return data;}}}
  async Task Download(){var d=await Call("device/status",false,true);if(Get(d,"paired").ToLowerInvariant()!="true")throw new Exception("Approve the pairing code in your studio first.");object raw;var p=d.TryGetValue("picture",out raw)?raw as Dictionary<string,object>:null;if(p==null)throw new Exception("No original picture yet. Start your browser display, or enable picture requests.");string id=Get(p,"id");Guid guid;if(!Guid.TryParse(id,out guid))throw new Exception("Invalid picture reference.");if(id==lastId&&File.Exists(Program.Cache)){state.Text="Your current picture is already cached.";return;}
   using(var request=new HttpRequestMessage(HttpMethod.Get,origin+"/api/product/device/art/"+id)){request.Headers.Authorization=new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer",token);using(var response=await http.SendAsync(request,HttpCompletionOption.ResponseHeadersRead)){if(!response.IsSuccessStatusCode||response.Content.Headers.ContentType==null||response.Content.Headers.ContentType.MediaType!="image/jpeg")throw new Exception("Private picture could not be retrieved.");string temp=Path.Combine(Program.Root,"download.tmp");try{using(var source=await response.Content.ReadAsStreamAsync())using(var output=new FileStream(temp,FileMode.Create,FileAccess.Write)){byte[] bytes=new byte[32768];int n,total=0;while((n=await source.ReadAsync(bytes,0,bytes.Length))>0){total+=n;if(total>12000000)throw new Exception("Picture is too large.");await output.WriteAsync(bytes,0,n);}}using(var picture=Program.ReadPicture(temp)){if(Get(p,"phase")=="night"&&!Program.NightSafe(picture))throw new Exception("Night picture was too bright; keeping your previous wallpaper.");}File.Copy(temp,Program.Cache,true);lastId=id;state.Text="Cached: "+Get(p,"title")+". Apply it when you’re ready.";}finally{if(File.Exists(temp))File.Delete(temp);}}}
  }
  void Save(){Directory.CreateDirectory(Program.Root);string protectedToken=Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(token),null,DataProtectionScope.CurrentUser));File.WriteAllText(config,Program.Json.Serialize(new Dictionary<string,object>{{"origin",origin},{"token",protectedToken}}));}
  void LoadConfig(){try{if(!File.Exists(config)||new FileInfo(config).Length>16000)return;var d=Program.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(config));string value=Get(d,"origin");if(!Program.AllowedServer(value))return;origin=value;server.Text=origin;token=Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(Get(d,"token")),null,DataProtectionScope.CurrentUser));pairing.Text="A previous pairing is saved for this Windows account.";}catch{state.Text="Saved pairing could not be opened. Request a new code.";}}
  void Apply(){if(!File.Exists(Program.Cache))throw new Exception("Download a picture first.");using(var image=Program.ReadPicture(Program.Cache)){}var desktop=(IDesktopWallpaper)new DesktopWallpaper();try{uint count;desktop.GetMonitorDevicePathCount(out count);var previous=new Dictionary<string,object>();uint position;desktop.GetPosition(out position);previous["position"]=position;for(uint i=0;i<count;i++){string path,wallpaper;desktop.GetMonitorDevicePathAt(i,out path);desktop.GetWallpaper(path,out wallpaper);previous[path]=wallpaper;}if(!File.Exists(backup))File.WriteAllText(backup,Program.Json.Serialize(previous));string target=null;if(monitor.SelectedIndex>0)desktop.GetMonitorDevicePathAt((uint)(monitor.SelectedIndex-1),out target);desktop.SetPosition(4);desktop.SetWallpaper(target,Program.Cache);}finally{Marshal.ReleaseComObject(desktop);}}
  void Restore(){if(!File.Exists(backup))throw new Exception("No saved wallpaper settings exist.");var previous=Program.Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(backup));var desktop=(IDesktopWallpaper)new DesktopWallpaper();try{foreach(var item in previous){if(item.Key=="position")continue;string path=Convert.ToString(item.Value);if(path==""||File.Exists(path))desktop.SetWallpaper(item.Key,path);}desktop.SetPosition(Convert.ToUInt32(previous["position"]));state.Text="Previous wallpaper settings restored.";}finally{Marshal.ReleaseComObject(desktop);}}
 }
 [ComImport,Guid("C2CF3110-460E-4FC1-B9D0-8A1C0C9CC4BD")]class DesktopWallpaper{}
 [ComImport,Guid("B92B56A9-8B55-4E14-9A89-0199BBB6F93B"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IDesktopWallpaper {
  void SetWallpaper([MarshalAs(UnmanagedType.LPWStr)]string monitor,[MarshalAs(UnmanagedType.LPWStr)]string path);
  void GetWallpaper([MarshalAs(UnmanagedType.LPWStr)]string monitor,[MarshalAs(UnmanagedType.LPWStr)]out string path);
  void GetMonitorDevicePathAt(uint index,[MarshalAs(UnmanagedType.LPWStr)]out string path);void GetMonitorDevicePathCount(out uint count);void GetMonitorRECT([MarshalAs(UnmanagedType.LPWStr)]string id,out NativeRect rectangle);void SetBackgroundColor(uint color);void GetBackgroundColor(out uint color);void SetPosition(uint position);void GetPosition(out uint position);
 }
 [StructLayout(LayoutKind.Sequential)]struct NativeRect{public int Left,Top,Right,Bottom;}
 class Saver:Form {
  Image picture;bool preview;Point start;DateTime opened=DateTime.UtcNow;
  [DllImport("user32.dll")]static extern IntPtr SetParent(IntPtr child,IntPtr parent);
  [DllImport("user32.dll")]static extern bool GetClientRect(IntPtr window,out NativeRect rect);
  [DllImport("user32.dll",EntryPoint="SetWindowLong")]static extern int SetWindowLong(IntPtr window,int index,int value);
  public Saver(Rectangle bounds,IntPtr parent){preview=parent!=IntPtr.Zero;FormBorderStyle=FormBorderStyle.None;BackColor=Color.Black;DoubleBuffered=true;ShowInTaskbar=false;StartPosition=FormStartPosition.Manual;TopMost=!preview;
   if(preview){SetParent(Handle,parent);SetWindowLong(Handle,-16,0x40000000|0x10000000);NativeRect rect;GetClientRect(parent,out rect);Bounds=new Rectangle(0,0,rect.Right,rect.Bottom);}else Bounds=bounds;
   try{var bitmap=Program.ReadPicture(Program.Cache);bool night=DateTime.Now.Hour>=21||DateTime.Now.Hour<6;if(night&&!Program.NightSafe(bitmap))bitmap.Dispose();else picture=bitmap;}catch{/* Offline, missing or unsafe picture: quiet black screen. */}
   start=Cursor.Position;KeyDown+=(s,e)=>{if(!preview&&DateTime.UtcNow-opened>TimeSpan.FromMilliseconds(600))Close();};MouseDown+=(s,e)=>{if(!preview)Close();};MouseMove+=(s,e)=>{if(!preview&&(Math.Abs(Cursor.Position.X-start.X)>15||Math.Abs(Cursor.Position.Y-start.Y)>15)&&DateTime.UtcNow-opened>TimeSpan.FromMilliseconds(600))Close();};FormClosed+=(s,e)=>{if(picture!=null)picture.Dispose();};
  }
  protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);if(picture==null)return;double scale=Math.Max(Width/(double)picture.Width,Height/(double)picture.Height);int w=(int)(picture.Width*scale),h=(int)(picture.Height*scale);e.Graphics.DrawImage(picture,new Rectangle((Width-w)/2,(Height-h)/2,w,h));}
 }
}

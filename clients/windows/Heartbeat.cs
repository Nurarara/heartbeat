// Heartbeat for Windows: the screensaver, the icon by the clock, sign-in, and quiet self-updates.
// One file, C# 5, .NET Framework 4.x (built into Windows 10 and 11), so nobody needs to install anything else.
// Build on Windows with `npm run windows:build`. The server API it uses is described in docs/api-for-apps.md.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace Heartbeat {

static class App {
 public const string Version = "1.4.3";
 public const string DefaultServer = "https://app.heartbeatart.co.uk";
 public static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 1000000 };
 public static string InstallDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Heartbeat"); } }
 public static string DataDir { get { string d = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Heartbeat"); Directory.CreateDirectory(d); return d; } }
 public static string ExePath { get { return Path.Combine(InstallDir, "Heartbeat.exe"); } }
 public static string ScrPath { get { return Path.Combine(InstallDir, "Heartbeat.scr"); } }
 public static string PicturePath { get { return Path.Combine(DataDir, "current.jpg"); } }

 [STAThread]
 static int Main(string[] args) {
  ServicePointManager.SecurityProtocol |= (SecurityProtocolType)3072; // TLS 1.2
  string mode = Mode(args);
  try {
   if (mode == "test") return SelfTest.Run();
   if (mode == "probe") return Probe(args[1], args[2]);
   if (mode == "update-check") return UpdateCheck(args[1]);
   if (mode == "render") { Render.ToFile(args[1], args[2], int.Parse(args[3]), int.Parse(args[4]), "14:05", "12°C · London"); return 0; }
   Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
   if (mode == "screen") { Application.Run(new SaverContext()); return 0; }
   if (mode == "preview") { IntPtr parent = PreviewHandle(args); if (parent != IntPtr.Zero) Application.Run(new PreviewForm(parent)); return 0; }
   if (mode == "config") { StartTray(); return 0; }
   if (mode == "uninstall") { Installer.Uninstall(); return 0; }
   if (mode == "tray") { Application.Run(new TrayContext(args.Contains("--welcome"))); return 0; }
   // Double-clicked from Downloads (or anywhere but the install folder): install, then hand over to the installed copy.
   // Explorer's "Configure" on the .scr runs it with no arguments: that means settings, not install.
   if (Path.GetExtension(Application.ExecutablePath).Equals(".scr", StringComparison.OrdinalIgnoreCase)) { StartTray(); return 0; }
   if (!string.Equals(Path.GetFullPath(Application.ExecutablePath), Path.GetFullPath(ExePath), StringComparison.OrdinalIgnoreCase)) { Installer.Install(); return 0; }
   Application.Run(new TrayContext(false)); return 0;
  } catch (Exception e) {
   if (mode != "screen" && mode != "preview" && mode != "test") MessageBox.Show(e.Message, "Heartbeat", MessageBoxButtons.OK, MessageBoxIcon.Warning);
   return 1;
  }
 }

 /// Windows passes /s (show), /p <hwnd> (little preview), /c (settings); case and ':' vary.
 public static string Mode(string[] args) {
  if (args.Length == 0) return "default";
  string a = args[0].ToLowerInvariant();
  if (a == "--self-test") return "test";
  if (a == "--render" && args.Length >= 5) return "render";
  if (a == "--probe" && args.Length >= 3) return "probe";
  if (a == "--update-check" && args.Length >= 2) return "update-check";
  if (a == "--tray") return "tray";
  if (a == "--uninstall") return "uninstall";
  if (a.StartsWith("/s")) return "screen";
  if (a.StartsWith("/p")) return "preview";
  if (a.StartsWith("/c")) return "config";
  return "default";
 }
 public static IntPtr PreviewHandle(string[] args) {
  string raw = args[0].Length > 3 && args[0][2] == ':' ? args[0].Substring(3) : args.Length > 1 ? args[1] : "";
  long value; return long.TryParse(raw, out value) ? new IntPtr(value) : IntPtr.Zero;
 }
 /// `--probe <server> <token>`: one real check against a server, for testing the connection.
 static int Probe(string server, string token) {
  var settings = new Settings { Server = server.TrimEnd('/') }; Settings.SetToken(token);
  var state = Cache.Refresh(settings, true).Result;
  var info = Cache.Info();
  Console.WriteLine("ready=" + App.Str(state, "ready") + " making=" + App.Str(state, "making") + " city=" + App.Str(state, "city") + " picture=" + App.Str(info, "id") + " caption=" + Cache.Caption(info));
  new Api(settings.Server, Settings.Token()).Post("/api/product/app/presence", new Dictionary<string, object> { { "session", Guid.NewGuid().ToString() }, { "surface", "screensaver" } }).Wait();
  var update = new Api(settings.Server, "").Get("/downloads/windows.json").Result;
  Console.WriteLine("update manifest version=" + App.Str(update, "version") + " newer=" + App.Newer(App.Str(update, "version"), App.Version));
  return 0;
 }
 /// What "Check for updates" does, without the tray: used to test the updater against a local server.
 static int UpdateCheck(string server) {
  if (!AllowedServer(server)) { Console.WriteLine("refused: server not allowed"); return 2; }
  try { Console.WriteLine("result: " + Updater.Check(new Settings { Server = server.TrimEnd(new[] { '/' }) }, true).Result); return 0; }
  catch (AggregateException e) { Console.WriteLine("refused: " + e.InnerException.Message); return 3; }
 }
 public static void StartTray() { try { Process.Start(new ProcessStartInfo(File.Exists(ExePath) ? ExePath : Application.ExecutablePath, "--tray") { UseShellExecute = false }); } catch { } }

 /// Only the real service, or a local test server on this computer.
 public static bool AllowedServer(string value) {
  Uri u; if (!Uri.TryCreate(value, UriKind.Absolute, out u)) return false;
  if (u.Scheme == "https" && u.AbsolutePath == "/" && string.IsNullOrEmpty(u.Query) && string.IsNullOrEmpty(u.UserInfo)) return true;
  return u.Scheme == "http" && (u.Host == "localhost" || u.Host == "127.0.0.1") && u.AbsolutePath == "/";
 }
 public static bool Newer(string candidate, string current) {
  System.Version a, b; return System.Version.TryParse(candidate, out a) && System.Version.TryParse(current, out b) && a > b;
 }
 public static string Str(Dictionary<string, object> d, string key) { object v; return d != null && d.TryGetValue(key, out v) && v != null ? Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture) : ""; }
 public static bool Truthy(Dictionary<string, object> d, string key) { object v; return d != null && d.TryGetValue(key, out v) && v is bool && (bool)v; }
 public static string Sha256(byte[] bytes) { using (var s = SHA256.Create()) return BitConverter.ToString(s.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
 public static void WriteAtomic(string path, byte[] bytes) { string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp"; File.WriteAllBytes(temp, bytes); if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path); }
 public static bool OnMains { get { return SystemInformation.PowerStatus.PowerLineStatus == PowerLineStatus.Online; } }
}

/// Small settings file plus the device key (encrypted for this Windows user only).
class Settings {
 public string Server = App.DefaultServer;
 public int IdleMinutes = 2;
 public bool IdleChosen;
 public int WallpaperMinutes = 30;
 public bool KeepScreenOn = true;
 public bool Wallpaper = true;
 public bool Screensaver = true;
 public bool LockFolder = true;
 public bool SavedBackgroundType;
 public string PreviousBackgroundType = "";
 public string LockFolderId = "";
 public string PreviousWallpaper, WallpaperId = "";
 public bool SavedWallpaper;
 public long LastWallpaperRequest;
 public long PausedUntil;
 public string PreviousSaver, PreviousActive, PreviousTimeout;
 public bool SavedPrevious;
 public long LastUpdateCheck;
 public string Email = "";

 static string FilePath { get { return Path.Combine(App.DataDir, "settings.json"); } }
 static string TokenPath { get { return Path.Combine(App.DataDir, "device.key"); } }
 public static Settings Load() {
  try { if (File.Exists(FilePath) && new FileInfo(FilePath).Length < 20000) { var s = App.Json.Deserialize<Settings>(File.ReadAllText(FilePath)); if (s != null) { if (!App.AllowedServer(s.Server + "/") && !App.AllowedServer(s.Server)) s.Server = App.DefaultServer; s.Server = s.Server.TrimEnd('/'); if (s.IdleMinutes < 1 || s.IdleMinutes > 60) s.IdleMinutes = 2; if (s.WallpaperMinutes < 2 || s.WallpaperMinutes > 240) s.WallpaperMinutes = 30; return s; } } } catch { }
  return new Settings();
 }
 public void Save() { try { App.WriteAtomic(FilePath, Encoding.UTF8.GetBytes(App.Json.Serialize(this))); } catch { } }
 public static string Token() {
  try { if (!File.Exists(TokenPath)) return ""; return Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(TokenPath), Encoding.UTF8.GetBytes("heartbeat-device"), DataProtectionScope.CurrentUser)); } catch { return ""; }
 }
 public static void SetToken(string token) {
  if (string.IsNullOrEmpty(token)) { try { File.Delete(TokenPath); } catch { } return; }
  App.WriteAtomic(TokenPath, ProtectedData.Protect(Encoding.UTF8.GetBytes(token), Encoding.UTF8.GetBytes("heartbeat-device"), DataProtectionScope.CurrentUser));
 }
 public bool Paused { get { return PausedUntil > DateTime.UtcNow.Ticks; } }
}

class ApiError : Exception { public int Status; public ApiError(int status, string message) : base(message) { Status = status; } }

/// Talks to the Heartbeat server. Everything clever happens there; the app only shows what it sends.
/// The device key is only ever sent to that server: requests go to paths on it, never to full addresses from
/// elsewhere, and redirects are not followed.
class Api {
 static readonly HttpClient Http = MakeClient();
 static HttpClient MakeClient() { var c = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(40) }; c.DefaultRequestHeaders.UserAgent.ParseAdd("HeartbeatWindows/" + App.Version); return c; }
 /// A path on the server ("/api/..."): no other host, no user name, no backslashes or odd characters.
 public static bool SafePath(string path) {
  if (string.IsNullOrEmpty(path) || path.Length > 300 || path[0] != '/' || path.StartsWith("//")) return false;
  foreach (char c in path) if (!(char.IsLetterOrDigit(c) && c < 128) && "/-_.?=&%".IndexOf(c) < 0) return false;
  return !path.Contains("..");
 }
 public static bool SafeId(string id) { if (string.IsNullOrEmpty(id) || id.Length > 100) return false; foreach (char c in id) if (!(char.IsLetterOrDigit(c) && c < 128) && c != '-') return false; return true; }
 public static Uri Address(string server, string path) {
  if (!SafePath(path)) return null;
  Uri home, target;
  if (!Uri.TryCreate(server.TrimEnd(new[] { '/' }) + "/", UriKind.Absolute, out home) || !Uri.TryCreate(server.TrimEnd(new[] { '/' }) + path, UriKind.Absolute, out target)) return null;
  return target.Scheme == home.Scheme && target.Host == home.Host && target.Port == home.Port && target.UserInfo == "" ? target : null;
 }
 readonly string server, token;
 public Api(string server, string token) { this.server = server.TrimEnd('/'); this.token = token; }

 async Task<HttpResponseMessage> Send(HttpMethod method, string path, object body) {
  Uri address = Address(server, path);
  if (address == null) throw new ApiError(0, "Unexpected address.");
  var request = new HttpRequestMessage(method, address);
  if (!string.IsNullOrEmpty(token)) request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
  if (body != null) request.Content = new StringContent(App.Json.Serialize(body), Encoding.UTF8, "application/json");
  return await Http.SendAsync(request).ConfigureAwait(false);
 }
 async Task<Dictionary<string, object>> Read(HttpResponseMessage response) {
  string text = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
  Dictionary<string, object> data = null; try { data = App.Json.Deserialize<Dictionary<string, object>>(text); } catch { }
  if (!response.IsSuccessStatusCode) { string message = App.Str(data, "error"); throw new ApiError((int)response.StatusCode, message != "" ? message : "Heartbeat couldn't be reached (" + (int)response.StatusCode + ")."); }
  return data ?? new Dictionary<string, object>();
 }
 public async Task<Dictionary<string, object>> Get(string path) { return await Read(await Send(HttpMethod.Get, path, null).ConfigureAwait(false)).ConfigureAwait(false); }
 public async Task<Dictionary<string, object>> Post(string path, object body) { return await Read(await Send(HttpMethod.Post, path, body ?? new Dictionary<string, object>()).ConfigureAwait(false)).ConfigureAwait(false); }
 public async Task<byte[]> Bytes(string path, int maximum) {
  var response = await Send(HttpMethod.Get, path, null).ConfigureAwait(false);
  if (!response.IsSuccessStatusCode) throw new ApiError((int)response.StatusCode, "Download failed.");
  var bytes = await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
  if (bytes.Length > maximum) throw new ApiError(413, "Download too large.");
  return bytes;
 }
}

/// Keeps the newest picture and its details on disk, so the screensaver appears instantly, even offline.
static class Cache {
 static string InfoPath { get { return Path.Combine(App.DataDir, "current.json"); } }
 public static Dictionary<string, object> Info() { try { return App.Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(InfoPath)); } catch { return new Dictionary<string, object>(); } }
 /// Fetches the state; downloads a new picture when there is one. Returns the state, or null when signed out.
 public static async Task<Dictionary<string, object>> Refresh(Settings settings, bool showing) {
  string token = Settings.Token(); if (token == "") return null;
  var api = new Api(settings.Server, token);
  Dictionary<string, object> state;
  try { state = await api.Get("/api/product/app/state" + (showing ? "?showing=1" : "")).ConfigureAwait(false); }
  catch (ApiError e) { if (e.Status == 401) Settings.SetToken(""); throw; }
  var info = Info(); var picture = state.ContainsKey("picture") ? state["picture"] as Dictionary<string, object> : null;
  if (picture != null && App.Str(picture, "id") != App.Str(info, "id")) {
   // The picture's address is built here from its id, so the device key only ever goes to the Heartbeat server.
   string pictureId = App.Str(picture, "id");
   if (!Api.SafeId(pictureId)) throw new ApiError(0, "Unexpected picture.");
   var bytes = await api.Bytes("/api/product/app/art/" + pictureId, 25000000).ConfigureAwait(false);
   if (bytes.Length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 || bytes[bytes.Length - 2] != 0xFF || bytes[bytes.Length - 1] != 0xD9) throw new ApiError(415, "The picture was incomplete.");
   info["id"] = App.Str(picture, "id"); info["title"] = App.Str(picture, "title");
   foreach (var key in new[] { "city", "temperature", "unit", "mood", "email" }) info[key] = state.ContainsKey(key) ? state[key] : null;
   Save(bytes, info);
   return state;
  }
  foreach (var key in new[] { "city", "temperature", "unit", "mood", "email" }) info[key] = state.ContainsKey(key) ? state[key] : null;
  Save(null, info);
  return state;
 }
 /// The tray and the screensaver are separate programs: only one writes the picture at a time (no awaits inside).
 static void Save(byte[] picture, Dictionary<string, object> info) {
  using (var gate = new Mutex(false, @"Local\HeartbeatCache")) {
   bool held = false;
   try { try { held = gate.WaitOne(10000); } catch (AbandonedMutexException) { held = true; }
    if (picture != null) App.WriteAtomic(App.PicturePath, picture);
    try { App.WriteAtomic(InfoPath, Encoding.UTF8.GetBytes(App.Json.Serialize(info))); } catch { }
   } finally { if (held) gate.ReleaseMutex(); }
  }
 }
 public static string Caption(Dictionary<string, object> info) {
  string t = App.Str(info, "temperature"), city = App.Str(info, "city"), unit = App.Str(info, "unit").ToUpperInvariant();
  string temp = t == "" ? "" : t + "°" + (unit == "F" ? "F" : "C");
  return temp != "" && city != "" ? temp + " · " + city : temp + city;
 }
}

/// Drawing shared by the screensaver, the preview and the tests: fill the screen, crop the overflow, add the clock.
static class Render {
 public static Rectangle Cover(Size image, Size box) {
  double scale = Math.Max((double)box.Width / image.Width, (double)box.Height / image.Height);
  int w = (int)Math.Ceiling(image.Width * scale), h = (int)Math.Ceiling(image.Height * scale);
  return new Rectangle((box.Width - w) / 2, (box.Height - h) / 2, w, h);
 }
 public static Bitmap Fit(Image source, Size box) {
  var bitmap = new Bitmap(Math.Max(1, box.Width), Math.Max(1, box.Height), PixelFormat.Format32bppPArgb);
  using (var g = Graphics.FromImage(bitmap)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.Clear(Color.Black); g.DrawImage(source, Cover(source.Size, box)); }
  return bitmap;
 }
 public static Image LoadFile(string path) { using (var stream = new MemoryStream(File.ReadAllBytes(path))) return new Bitmap(Image.FromStream(stream)); }
 public static void Overlay(Graphics g, Size box, string time, string caption) {
  g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
  float unit = Math.Max(10f, Math.Min(box.Width, box.Height) / 100f);
  float x = unit * 4, bottom = box.Height - unit * 4;
  using (var big = new Font("Segoe UI Light", unit * 7f, FontStyle.Regular, GraphicsUnit.Pixel))
  using (var small = new Font("Segoe UI", unit * 1.9f, FontStyle.Regular, GraphicsUnit.Pixel)) {
   SizeF smallSize = g.MeasureString(caption == "" ? " " : caption, small), bigSize = g.MeasureString(time, big);
   float captionY = bottom - smallSize.Height, timeY = captionY - bigSize.Height * 0.92f;
   Shadowed(g, time, big, x - unit * 0.4f, timeY); if (caption != "") Shadowed(g, caption, small, x, captionY);
  }
 }
 static void Shadowed(Graphics g, string text, Font font, float x, float y) {
  using (var shadow = new SolidBrush(Color.FromArgb(110, 0, 0, 0))) g.DrawString(text, font, shadow, x + 1.5f, y + 2f);
  using (var ink = new SolidBrush(Color.FromArgb(235, 255, 255, 255))) g.DrawString(text, font, ink, x, y);
 }
 public static void ToFile(string input, string output, int width, int height, string time, string caption) {
  using (var image = LoadFile(input)) using (var frame = Fit(image, new Size(width, height))) {
   using (var g = Graphics.FromImage(frame)) Overlay(g, frame.Size, time, caption);
   frame.Save(output, ImageFormat.Png);
  }
 }
 public static Icon TrayIcon() {
  // A small warm pulse, drawn in code so no icon file is needed.
  var b = new Bitmap(32, 32, PixelFormat.Format32bppArgb);
  using (var g = Graphics.FromImage(b)) {
   g.SmoothingMode = SmoothingMode.AntiAlias; g.Clear(Color.Transparent);
   using (var fill = new SolidBrush(Color.FromArgb(252, 104, 75))) g.FillEllipse(fill, 2, 2, 28, 28);
   using (var pen = new Pen(Color.White, 2.6f)) { pen.LineJoin = LineJoin.Round; g.DrawLines(pen, new[] { new PointF(6, 17), new PointF(11, 17), new PointF(14, 10), new PointF(18, 23), new PointF(21, 15), new PointF(26, 15) }); }
  }
  return Icon.FromHandle(b.GetHicon());
 }
}

static class Native {
 [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool SystemParametersInfo(uint action, uint param, string pv, uint winIni);
 public const uint SetDeskWallpaper = 20;
 [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
 [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
 /// Minutes since the last mouse or keyboard input.
 public static double IdleMinutes() { var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)) }; if (!GetLastInputInfo(ref info)) return 0; return unchecked((uint)Environment.TickCount - info.dwTime) / 60000.0; }
 [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
 public const uint Continuous = 0x80000000, SystemRequired = 0x1, DisplayRequired = 0x2;
 [DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint action, uint param, IntPtr pv, uint winIni);
 public const uint SetScreenSaveTimeout = 15, SetScreenSaveActive = 17, UpdateIni = 1, SendChange = 2;
 [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
 [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hWnd, int index, int value);
 [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hWnd, int index);
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
 [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern int GetShortPathName(string longPath, StringBuilder shortPath, int size);
 public static string ShortPath(string path) { var sb = new StringBuilder(260); int n = GetShortPathName(path, sb, sb.Capacity); return n > 0 && n < sb.Capacity ? sb.ToString() : path; }
}

/// The lock screen (Windows + L): Windows can't be told the picture directly, but it can show a slideshow
/// from a folder. Heartbeat keeps its newest pictures in Pictures\Heartbeat for that slideshow.
static class LockFolder {
 public static string Path { get { return System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "Heartbeat"); } }
 public static void Update(Settings settings) {
  string id = App.Str(Cache.Info(), "id");
  if (!settings.LockFolder || id == "" || id == settings.LockFolderId || !File.Exists(App.PicturePath)) return;
  Directory.CreateDirectory(Path);
  // Keep the three newest, so the slideshow always shows something recent.
  File.Copy(App.PicturePath, System.IO.Path.Combine(Path, "heartbeat-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + ".jpg"), true);
  foreach (var old in new DirectoryInfo(Path).GetFiles("heartbeat-*.jpg").OrderByDescending(f => f.Name).Skip(3)) { try { old.Delete(); } catch { } }
  settings.LockFolderId = id; settings.Save();
 }
 /// Opens the lock screen settings and the folder, with what to choose.
 public static void SetUp(Settings settings) {
  settings.LockFolder = true; settings.LockFolderId = ""; Update(settings);
  MessageBox.Show("To show Heartbeat when you press Windows + L:\n\n1. In the Settings window that opens, under \"Personalise your lock screen\", choose Slideshow.\n2. Remove any other albums, then choose \"Browse\" and pick the folder:\n   " + Path + "\n3. Optional: turn off \"Get fun facts, tips and more\".\n\nHeartbeat keeps its newest pictures in that folder.", "Heartbeat on your lock screen", MessageBoxButtons.OK, MessageBoxIcon.Information);
  try { Process.Start(new ProcessStartInfo("ms-settings:lockscreen") { UseShellExecute = true }); } catch { }
  try { Process.Start(new ProcessStartInfo("explorer.exe", "\"" + Path + "\"") { UseShellExecute = true }); } catch { }
 }
}

/// The desktop wallpaper: the newest picture, filling every screen.
static class Wallpaper {
 const string Desktop = @"Control Panel\Desktop";
 /// Windows caches a wallpaper by file name, so alternate between two files to make each change show.
 public static void Apply(Settings settings) {
  if (!File.Exists(App.PicturePath)) return;
  using (var d = Registry.CurrentUser.CreateSubKey(Desktop)) {
   if (!settings.SavedWallpaper) { settings.PreviousWallpaper = Convert.ToString(d.GetValue("Wallpaper", "")); settings.SavedWallpaper = true; }
   d.SetValue("WallpaperStyle", "10"); d.SetValue("TileWallpaper", "0"); // Fill
  }
  string a = Path.Combine(App.DataDir, "wallpaper-a.jpg"), b = Path.Combine(App.DataDir, "wallpaper-b.jpg");
  string target = File.Exists(a) && (!File.Exists(b) || File.GetLastWriteTimeUtc(a) > File.GetLastWriteTimeUtc(b)) ? b : a;
  File.Copy(App.PicturePath, target, true); File.SetLastWriteTimeUtc(target, DateTime.UtcNow);
  // Windows Spotlight (and slideshows) replace the wallpaper by themselves: switch the background to "Picture".
  try {
   using (var w = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers")) {
    if (!settings.SavedBackgroundType) { settings.PreviousBackgroundType = Convert.ToString(w.GetValue("BackgroundType", "")); settings.SavedBackgroundType = true; }
    w.SetValue("BackgroundType", 0, RegistryValueKind.DWord);
   }
  } catch { }
  Native.SystemParametersInfo(Native.SetDeskWallpaper, 0, target, Native.UpdateIni | Native.SendChange);
  settings.WallpaperId = App.Str(Cache.Info(), "id"); settings.Save();
 }
 public static void Restore(Settings settings) {
  try {
   if (settings.SavedBackgroundType && settings.PreviousBackgroundType != "") using (var w = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers")) w.SetValue("BackgroundType", int.Parse(settings.PreviousBackgroundType), RegistryValueKind.DWord);
   settings.SavedBackgroundType = false;
  } catch { }
  if (!settings.SavedWallpaper) return;
  string previous = settings.PreviousWallpaper ?? "";
  if (previous.IndexOf(@"\Heartbeat\", StringComparison.OrdinalIgnoreCase) >= 0 || (previous != "" && !File.Exists(previous))) previous = "";
  Native.SystemParametersInfo(Native.SetDeskWallpaper, 0, previous, Native.UpdateIni | Native.SendChange);
  settings.SavedWallpaper = false; settings.WallpaperId = ""; settings.Save();
 }
}

/// Installs into the user's own folder (no admin needed), sets the screensaver, starts with Windows, and undoes all of it.
static class Installer {
 const string Desktop = @"Control Panel\Desktop", RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run", UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Heartbeat";
 public static void Install() {
  // Ask, don't assume: what should Heartbeat do on this computer?
  var choices = new InstallForm();
  if (choices.ShowDialog() != DialogResult.OK) return;
  StopRunningCopies();
  Directory.CreateDirectory(App.InstallDir);
  byte[] self = File.ReadAllBytes(Application.ExecutablePath);
  Replace(App.ExePath, self); Replace(App.ScrPath, self);
  var settings = Settings.Load();
  settings.Wallpaper = choices.Wallpaper; settings.Screensaver = choices.Screensaver;
  if (choices.Screensaver) SetScreensaver(settings, settings.IdleMinutes);
  settings.Save();
  // Starting with Windows keeps the wallpaper current; without it Heartbeat runs only when opened.
  using (var run = Registry.CurrentUser.CreateSubKey(RunKey)) { if (choices.StartWithWindows) run.SetValue("Heartbeat", "\"" + App.ExePath + "\" --tray"); else run.DeleteValue("Heartbeat", false); }
  using (var u = Registry.CurrentUser.CreateSubKey(UninstallKey)) {
   u.SetValue("DisplayName", "Heartbeat"); u.SetValue("DisplayVersion", App.Version); u.SetValue("Publisher", "Heartbeat");
   u.SetValue("DisplayIcon", App.ExePath); u.SetValue("UninstallString", "\"" + App.ExePath + "\" --uninstall");
   u.SetValue("InstallLocation", App.InstallDir); u.SetValue("NoModify", 1); u.SetValue("NoRepair", 1);
  }
  StartMenuShortcut(true);
  Process.Start(new ProcessStartInfo(App.ExePath, "--tray --welcome") { UseShellExecute = false });
 }
 /// Writes a file even while an older copy is running: Windows allows renaming a running program.
 public static void Replace(string path, byte[] bytes) {
  // Write the new file first; only then swap, and put the old one back if the swap fails.
  string fresh = path + ".new", old = path + ".old";
  File.WriteAllBytes(fresh, bytes);
  if (new FileInfo(fresh).Length != bytes.Length) throw new IOException("The new version could not be written.");
  if (!File.Exists(path)) { File.Move(fresh, path); return; }
  try { File.Delete(old); } catch { }
  File.Move(path, old);
  try { File.Move(fresh, path); } catch { File.Move(old, path); throw; }
 }
 static void StopRunningCopies() {
  foreach (var p in Process.GetProcessesByName("Heartbeat").Concat(Process.GetProcessesByName("Heartbeat.scr"))) {
   try { string file = p.MainModule.FileName; if (p.Id != Process.GetCurrentProcess().Id && (string.Equals(file, App.ExePath, StringComparison.OrdinalIgnoreCase) || string.Equals(file, App.ScrPath, StringComparison.OrdinalIgnoreCase))) { p.Kill(); p.WaitForExit(3000); } } catch { }
  }
 }
 public static void SetScreensaver(Settings settings, int minutes) {
  using (var d = Registry.CurrentUser.CreateSubKey(Desktop)) {
   if (!settings.SavedPrevious) { settings.PreviousSaver = Convert.ToString(d.GetValue("SCRNSAVE.EXE", "")); settings.PreviousActive = Convert.ToString(d.GetValue("ScreenSaveActive", "")); settings.PreviousTimeout = Convert.ToString(d.GetValue("ScreenSaveTimeOut", "")); settings.SavedPrevious = true; }
   d.SetValue("SCRNSAVE.EXE", Native.ShortPath(App.ScrPath)); d.SetValue("ScreenSaveActive", "1"); d.SetValue("ScreenSaveTimeOut", (minutes * 60).ToString());
  }
  settings.IdleMinutes = minutes;
  Native.SystemParametersInfo(Native.SetScreenSaveTimeout, (uint)(minutes * 60), IntPtr.Zero, Native.UpdateIni | Native.SendChange);
  Native.SystemParametersInfo(Native.SetScreenSaveActive, 1, IntPtr.Zero, Native.UpdateIni | Native.SendChange);
 }
 /// Puts the previous screensaver back (used by the menu switch and by uninstall).
 public static void RestoreScreensaver(Settings settings) {
  using (var d = Registry.CurrentUser.CreateSubKey(Desktop)) {
   string current = Convert.ToString(d.GetValue("SCRNSAVE.EXE", ""));
   if (current.IndexOf("Heartbeat", StringComparison.OrdinalIgnoreCase) < 0 && !current.Equals(Native.ShortPath(App.ScrPath), StringComparison.OrdinalIgnoreCase)) return;
   if (string.IsNullOrEmpty(settings.PreviousSaver)) d.DeleteValue("SCRNSAVE.EXE", false); else d.SetValue("SCRNSAVE.EXE", settings.PreviousSaver);
   d.SetValue("ScreenSaveActive", string.IsNullOrEmpty(settings.PreviousActive) ? (string.IsNullOrEmpty(settings.PreviousSaver) ? "0" : "1") : settings.PreviousActive);
   if (!string.IsNullOrEmpty(settings.PreviousTimeout)) d.SetValue("ScreenSaveTimeOut", settings.PreviousTimeout);
  }
  Native.SystemParametersInfo(Native.SetScreenSaveActive, string.IsNullOrEmpty(settings.PreviousSaver) ? 0u : 1u, IntPtr.Zero, Native.UpdateIni | Native.SendChange);
 }
 public static void Uninstall() {
  if (MessageBox.Show("Remove Heartbeat from this computer? Your account and pictures stay safe online.", "Heartbeat", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return;
  var settings = Settings.Load();
  try { string token = Settings.Token(); if (token != "") new Api(settings.Server, token).Post("/api/product/app/signout", null).Wait(5000); } catch { }
  RestoreScreensaver(settings);
  try { using (var run = Registry.CurrentUser.OpenSubKey(RunKey, true)) if (run != null) run.DeleteValue("Heartbeat", false); } catch { }
  try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }
  try { Wallpaper.Restore(settings); } catch { }
  StartMenuShortcut(false); Settings.SetToken("");
  StopRunningCopies();
  MessageBox.Show("Heartbeat has been removed.", "Heartbeat");
  // A running program can't delete itself: a short-lived command removes the folders just after this exits.
  string script = "/c timeout /t 3 /nobreak >nul & rmdir /s /q \"" + App.InstallDir + "\" & rmdir /s /q \"" + App.DataDir + "\"";
  Process.Start(new ProcessStartInfo("cmd.exe", script) { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden });
  Environment.Exit(0);
 }
 static void StartMenuShortcut(bool create) {
  string link = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Heartbeat.lnk");
  try {
   if (!create) { File.Delete(link); return; }
   Type shellType = Type.GetTypeFromProgID("WScript.Shell"); if (shellType == null) return;
   dynamic shell = Activator.CreateInstance(shellType); dynamic shortcut = shell.CreateShortcut(link);
   shortcut.TargetPath = App.ExePath; shortcut.Arguments = "--tray"; shortcut.Description = "Heartbeat"; shortcut.Save();
  } catch { }
 }
}

/// The first screen of the installer: what should Heartbeat do on this computer?
class InstallForm : Form {
 readonly CheckBox wall = new CheckBox(), saver = new CheckBox(), start = new CheckBox();
 public bool Wallpaper { get { return wall.Checked; } }
 public bool Screensaver { get { return saver.Checked; } }
 public bool StartWithWindows { get { return start.Checked; } }
 public InstallForm() {
  Text = "Install Heartbeat"; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false; StartPosition = FormStartPosition.CenterScreen;
  ClientSize = new Size(460, 330); BackColor = Color.FromArgb(7, 11, 16); ForeColor = Color.FromArgb(242, 240, 231); Font = new Font("Segoe UI", 10f); Icon = Render.TrayIcon();
  var title = new Label { Text = "Heartbeat on this computer", Font = new Font("Segoe UI Semilight", 17f), Bounds = new Rectangle(28, 22, 404, 38) };
  var help = new Label { Text = "A new picture for your time, weather and mood. Choose where it shows; you can change this any time from the icon by the clock.", ForeColor = Color.FromArgb(166, 171, 176), Bounds = new Rectangle(28, 64, 404, 44) };
  Box(wall, "Use as my wallpaper (a new picture while I use the computer)", 120);
  Box(saver, "Use as my screensaver (after 2 minutes idle)", 152);
  Box(start, "Start Heartbeat with Windows (keeps it current)", 184);
  var ok = new Button { Text = "Install", Bounds = new Rectangle(28, 248, 200, 40), FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(252, 104, 75), ForeColor = Color.FromArgb(22, 10, 6), Font = new Font("Segoe UI Semibold", 10.5f), DialogResult = DialogResult.OK };
  ok.FlatAppearance.BorderSize = 0;
  var cancel = new Button { Text = "Cancel", Bounds = new Rectangle(240, 248, 120, 40), FlatStyle = FlatStyle.Flat, ForeColor = Color.FromArgb(242, 240, 231), DialogResult = DialogResult.Cancel };
  var fine = new Label { Text = "Installs for you only. No admin rights. Your previous wallpaper and screensaver come back if you uninstall.", ForeColor = Color.FromArgb(120, 128, 135), Font = new Font("Segoe UI", 8.5f), Bounds = new Rectangle(28, 296, 404, 30) };
  AcceptButton = ok; CancelButton = cancel;
  Controls.AddRange(new Control[] { title, help, wall, saver, start, ok, cancel, fine });
 }
 void Box(CheckBox box, string text, int y) { box.Text = text; box.Checked = true; box.Bounds = new Rectangle(28, y, 410, 28); box.ForeColor = Color.FromArgb(242, 240, 231); }
}

/// Downloads a newer version (checked against its SHA-256), swaps it in, and restarts quietly.
/// Heartbeat's release key. Updates are installed only when their details (version, file, SHA-256, size) carry a
/// valid signature from the matching private key, which is kept offline and never on the download server.
/// RSA-3072 with PKCS#1 v1.5 and SHA-256, checked here with plain arithmetic so it works the same on every Windows.
static class Release {
 const string Modulus = "ttKROaGM0PWtsA3ZhSl82WM9tRt0oocSunEQjTaUn/otVI3/c/NIaQFlpreyKTTDB3gfQOmzF8zYZAD6L1k5MaGH0dvup33SdtdUINDg5Sf39JoL1/vLXNqOGvhQf+2Cst3gz2N8hPqlI1BfK6e4MLLtyZ24cka1QlKlloBwXyDorJf1xV+i8GlgfBv0a5jPoyr//Fro4KjQ9h7odFQEIswtawslAs44u6CwH5ulV2AlQ+mceDohaiItAddNjCLCvIlTorCbc9aujojDC1dNTvji1lLhwAQ5z6/5fON1pE/bS6B3aPJbHRXrdW3I3uWDFWpWI7p/w3bW41zyw1+802Mof6HzK8gQQNkxHo77Oyftldi4SOcrpv043kstzvM9HVVLdOiDbg5SiL4ilKn4u582z++JogjBm+k8qOjzHoXuF9xVwp+5jDV0wy99rNgcUCXWwpKCZUzRljUIr29BY0id98o0J4WD1ujgxgE8WKMeoJ2Eb70RRzjtdqzmj/iR";
 const string Exponent = "AQAB";
 public static string Message(string version, string url, string sha256, string size) { return "heartbeat-windows-release/1\n" + version + "\n" + url + "\n" + sha256 + "\n" + size; }
 public static bool Verify(string message, string signature) { return Verify(Encoding.UTF8.GetBytes(message), signature, Modulus, Exponent); }
 public static bool Verify(byte[] data, string signature, string modulus, string exponent) {
  try {
   byte[] n = Convert.FromBase64String(modulus), e = Convert.FromBase64String(exponent), sig = Convert.FromBase64String(signature ?? "");
   int k = n.Length;
   if (k < 256 || sig.Length != k) return false;
   BigInteger N = Positive(n), S = Positive(sig);
   if (S >= N) return false;
   byte[] m = BigEndian(BigInteger.ModPow(S, Positive(e), N), k);
   if (m == null) return false;
   byte[] hash; using (var h = SHA256.Create()) hash = h.ComputeHash(data);
   // DigestInfo for SHA-256, then the whole expected block is compared byte for byte.
   byte[] prefix = { 0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20 };
   int pad = k - 3 - prefix.Length - hash.Length;
   if (pad < 8) return false;
   var expected = new byte[k];
   expected[1] = 1;
   for (int i = 2; i < 2 + pad; i++) expected[i] = 0xff;
   Buffer.BlockCopy(prefix, 0, expected, 3 + pad, prefix.Length);
   Buffer.BlockCopy(hash, 0, expected, 3 + pad + prefix.Length, hash.Length);
   int diff = 0;
   for (int i = 0; i < k; i++) diff |= m[i] ^ expected[i];
   return diff == 0;
  } catch { return false; }
 }
 static BigInteger Positive(byte[] bigEndian) { var little = new byte[bigEndian.Length + 1]; for (int i = 0; i < bigEndian.Length; i++) little[i] = bigEndian[bigEndian.Length - 1 - i]; return new BigInteger(little); }
 static byte[] BigEndian(BigInteger value, int length) {
  byte[] little = value.ToByteArray();
  int used = little.Length; while (used > 0 && little[used - 1] == 0) used--;
  if (used > length) return null;
  var result = new byte[length];
  for (int i = 0; i < used; i++) result[length - 1 - i] = little[i];
  return result;
 }
}

static class Updater {
 public static async Task<string> Check(Settings settings, bool force) {
  if (!force && DateTime.UtcNow.Ticks - settings.LastUpdateCheck < TimeSpan.FromHours(20).Ticks) return "";
  settings.LastUpdateCheck = DateTime.UtcNow.Ticks; settings.Save();
  var api = new Api(settings.Server, "");
  var manifest = await api.Get("/downloads/windows.json").ConfigureAwait(false);
  string version = App.Str(manifest, "version"), url = App.Str(manifest, "url"), sha = App.Str(manifest, "sha256"), size = App.Str(manifest, "size");
  if (!App.Newer(version, App.Version)) return "Heartbeat is up to date (" + App.Version + ").";
  long expected;
  if (!url.StartsWith("/downloads/") || url.Contains("..") || sha.Length != 64 || !long.TryParse(size, out expected) || expected <= 0 || expected > 50000000) return "";
  // Only a release signed with Heartbeat's private release key is installed. The server alone can't publish one.
  if (!Release.Verify(Release.Message(version, url, sha, size), App.Str(manifest, "signature"))) {
   if (force) throw new Exception("This update couldn't be confirmed as coming from Heartbeat, so it wasn't installed.");
   return "";
  }
  var bytes = await api.Bytes(url, 50000000).ConfigureAwait(false);
  if (bytes.LongLength != expected || App.Sha256(bytes) != sha) throw new Exception("The update didn't match its signed details, so it was not installed.");
  Installer.Replace(App.ExePath, bytes);
  try { Installer.Replace(App.ScrPath, bytes); } catch { }
  return "updated:" + version;
 }
 public static void CleanOld() { foreach (var p in new[] { App.ExePath + ".old", App.ScrPath + ".old" }) { try { File.Delete(p); } catch { } } }
}

/// The icon by the clock: sign-in, mood, pause, screensaver timing, studio, updates, sign out, uninstall.
class TrayContext : ApplicationContext {
 readonly NotifyIcon icon = new NotifyIcon();
 readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
 readonly Settings settings = Settings.Load();
 readonly Mutex single;
 Dictionary<string, object> state;
 bool busy;

 public TrayContext(bool welcome) {
  // One icon at a time. Straight after an update, wait for the previous version to finish closing.
  single = new Mutex(false, @"Local\HeartbeatTray");
  bool owned; try { owned = single.WaitOne(Environment.GetCommandLineArgs().Contains("--updated") ? 20000 : 0); } catch (AbandonedMutexException) { owned = true; }
  if (!owned) { ExitThread(); Environment.Exit(0); return; }
  Updater.CleanOld();
  // Earlier versions defaulted to 5 minutes; move to 2 unless someone picked a time.
  if (!settings.IdleChosen && settings.IdleMinutes == 5 && settings.Screensaver) { try { Installer.SetScreensaver(settings, 2); settings.Save(); } catch { } }
  icon.Icon = Render.TrayIcon(); icon.Text = "Heartbeat"; icon.Visible = true;
  icon.ContextMenuStrip = new ContextMenuStrip(); icon.ContextMenuStrip.Opening += (s, e) => BuildMenu();
  icon.MouseUp += (s, e) => { if (e.Button == MouseButtons.Left) { if (Settings.Token() == "") SignIn(); else typeof(NotifyIcon).GetMethod("ShowContextMenu", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic).Invoke(icon, null); } };
  Microsoft.Win32.SystemEvents.SessionSwitch += (s, e) => { locked = e.Reason == SessionSwitchReason.SessionLock; if (!locked) Tick(false); };
  timer.Tick += (s, e) => Tick(false);
  timer.Interval = 60000; timer.Start();
  if (Settings.Token() == "") SignIn(); else { Tick(true); if (welcome) Say("Heartbeat is your wallpaper and screensaver now."); }
 }

 void Say(string text) { icon.BalloonTipTitle = "Heartbeat"; icon.BalloonTipText = text; icon.ShowBalloonTip(5000); }

 /// Every minute: keep the wallpaper current, and keep the cached picture fresh for the screensaver.
 /// The wallpaper asks for a new picture every 30 minutes (60 on battery), only while someone is using the computer.
 int ticks; bool locked;
 async void Tick(bool now) {
  ticks++;
  if (busy || Settings.Token() == "") { await CheckUpdates(false); return; }
  busy = true;
  try {
   long since = DateTime.UtcNow.Ticks - settings.LastWallpaperRequest;
   bool someoneHere = !locked && Native.IdleMinutes() < 10;
   bool wantPicture = settings.Wallpaper && !settings.Paused && someoneHere && since > TimeSpan.FromMinutes(App.OnMains ? settings.WallpaperMinutes : settings.WallpaperMinutes * 2).Ticks;
   if (now || wantPicture || ticks % (App.OnMains ? 15 : 30) == 0) {
    state = await Cache.Refresh(settings, wantPicture);
    if (state == null) { SignIn(); return; }
    int pace; if (int.TryParse(App.Str(state, "wallpaperMinutes"), out pace) && pace >= 2 && pace <= 240) settings.WallpaperMinutes = pace;
    if (wantPicture) settings.LastWallpaperRequest = DateTime.UtcNow.Ticks;
    settings.Save();
    // While a new picture is being made, look again next minute.
    if (App.Truthy(state, "making")) settings.LastWallpaperRequest = DateTime.UtcNow.Ticks - TimeSpan.FromMinutes(Math.Max(1, (App.OnMains ? settings.WallpaperMinutes : settings.WallpaperMinutes * 2) - 1)).Ticks;
   }
   // A new picture (from the wallpaper or the screensaver) becomes the wallpaper.
   try { LockFolder.Update(settings); } catch { }
   if (settings.Wallpaper && App.Str(Cache.Info(), "id") != "" && App.Str(Cache.Info(), "id") != settings.WallpaperId) Wallpaper.Apply(settings);
  }
  catch (ApiError e) { if (e.Status == 401) { Say("Please sign in to Heartbeat again."); SignIn(); } }
  catch { }
  finally { busy = false; }
  await CheckUpdates(false);
 }

 async Task CheckUpdates(bool force) {
  try {
   string result = await Updater.Check(settings, force);
   if (result.StartsWith("updated:")) { Process.Start(new ProcessStartInfo(App.ExePath, "--tray --updated") { UseShellExecute = false }); icon.Visible = false; single.ReleaseMutex(); Environment.Exit(0); }
   else if (force && result != "") Say(result);
  } catch (Exception e) { if (force) Say(e.Message); }
 }

 void ShowNow() { try { Process.Start(new ProcessStartInfo(File.Exists(App.ScrPath) ? App.ScrPath : Application.ExecutablePath, "/s") { UseShellExecute = false }); } catch (Exception x) { Say(x.Message); } }

 void SignIn() {
  if (Application.OpenForms.OfType<SignInForm>().Any()) { Application.OpenForms.OfType<SignInForm>().First().Activate(); return; }
  var form = new SignInForm(settings);
  form.FormClosed += async (s, e) => {
   if (Settings.Token() == "") return;
   // Straight away: start a picture, make it the wallpaper, and show Heartbeat full-screen once.
   try { state = await Cache.Refresh(settings, true); settings.LastWallpaperRequest = DateTime.UtcNow.Ticks; settings.Save(); if (settings.Wallpaper) Wallpaper.Apply(settings); } catch { }
   Say("You're in. Heartbeat is your wallpaper and screensaver. Move the mouse to close it; right-click this icon for moods and settings.");
   await Task.Delay(1500); ShowNow();
  };
  form.Show(); form.Activate();
 }

 void BuildMenu() {
  var m = icon.ContextMenuStrip; m.Items.Clear();
  bool signedIn = Settings.Token() != "";
  var info = Cache.Info();
  m.Items.Add(new ToolStripMenuItem("Heartbeat " + App.Version) { Enabled = false });
  m.Items.Add(new ToolStripMenuItem(signedIn ? "Heartbeat · " + (settings.Email != "" ? settings.Email : App.Str(info, "email")) : "Heartbeat · not signed in") { Enabled = false });
  m.Items.Add(new ToolStripSeparator());
  if (!signedIn) { m.Items.Add("Sign in…", null, (s, e) => SignIn()); }
  else {
   var moods = new ToolStripMenuItem("Mood");
   string current = App.Str(info, "mood");
   object list; if (state != null && state.TryGetValue("moods", out list) && list is System.Collections.ArrayList) {
    foreach (Dictionary<string, object> mood in (System.Collections.ArrayList)list) {
     string id = App.Str(mood, "id");
     var item = new ToolStripMenuItem(App.Str(mood, "label")) { Checked = id == current };
     item.Click += async (s, e) => { try { await new Api(settings.Server, Settings.Token()).Post("/api/product/app/mood", new Dictionary<string, object> { { "mood", id } }); state = await Cache.Refresh(settings, false); Say("Mood: " + ((ToolStripMenuItem)s).Text + ". Your next picture follows it."); } catch (Exception x) { Say(x.Message); } };
     moods.DropDownItems.Add(item);
    }
   } else moods.DropDownItems.Add(new ToolStripMenuItem("Loading…") { Enabled = false });
   m.Items.Add(moods);
   m.Items.Add("Show Heartbeat now", null, (s, e) => ShowNow());
   var wall = new ToolStripMenuItem("Use as wallpaper") { Checked = settings.Wallpaper };
   wall.Click += (s, e) => { try { settings.Wallpaper = !settings.Wallpaper; settings.Save(); if (settings.Wallpaper) { Wallpaper.Apply(settings); Tick(false); } else Wallpaper.Restore(settings); } catch (Exception x) { Say(x.Message); } };
   m.Items.Add(wall);
   m.Items.Add("Show on my lock screen (Windows + L)…", null, (s, e) => { try { LockFolder.SetUp(settings); } catch (Exception x) { Say(x.Message); } });
   var saverItem = new ToolStripMenuItem("Use as screensaver") { Checked = settings.Screensaver };
   saverItem.Click += (s, e) => { try { settings.Screensaver = !settings.Screensaver; if (settings.Screensaver) Installer.SetScreensaver(settings, settings.IdleMinutes); else Installer.RestoreScreensaver(settings); settings.Save(); Say(settings.Screensaver ? "Heartbeat is your screensaver again." : "Your previous screensaver is back."); } catch (Exception x) { Say(x.Message); } };
   m.Items.Add(saverItem);
   if (settings.Paused) m.Items.Add("Resume new pictures", null, (s, e) => { settings.PausedUntil = 0; settings.Save(); Say("New pictures are back on."); });
   else m.Items.Add("Pause new pictures for 1 hour", null, (s, e) => { settings.PausedUntil = DateTime.UtcNow.AddHours(1).Ticks; settings.Save(); Say("Paused for an hour. The screensaver still shows your latest picture."); });
   var after = new ToolStripMenuItem("Screensaver starts after");
   foreach (int minutes in new[] { 1, 2, 5, 10, 15, 30 }) {
    int value = minutes;
    var item = new ToolStripMenuItem(minutes == 1 ? "1 minute" : minutes + " minutes") { Checked = settings.IdleMinutes == minutes };
    item.Click += (s, e) => { try { if (settings.Screensaver) Installer.SetScreensaver(settings, value); else settings.IdleMinutes = value; settings.IdleChosen = true; settings.Save(); Say("Heartbeat now appears after " + value + " minutes idle."); } catch (Exception x) { Say(x.Message); } };
    after.DropDownItems.Add(item);
   }
   m.Items.Add(after);
   var keep = new ToolStripMenuItem("Keep the screen on while plugged in") { Checked = settings.KeepScreenOn };
   keep.Click += (s, e) => { settings.KeepScreenOn = !settings.KeepScreenOn; settings.Save(); };
   m.Items.Add(keep);
   m.Items.Add(new ToolStripSeparator());
   m.Items.Add("Open my studio (moods, city, account)", null, (s, e) => { try { Process.Start(settings.Server + "/app"); } catch { } });
   m.Items.Add("Check for updates", null, async (s, e) => await CheckUpdates(true));
   m.Items.Add("Sign out", null, async (s, e) => { try { await new Api(settings.Server, Settings.Token()).Post("/api/product/app/signout", null); } catch { } Settings.SetToken(""); settings.Email = ""; settings.Save(); Say("Signed out."); });
  }
  m.Items.Add("Uninstall Heartbeat…", null, (s, e) => Installer.Uninstall());
  m.Items.Add("Quit until next restart", null, (s, e) => { icon.Visible = false; ExitThread(); Environment.Exit(0); });
 }
}

/// Email, then the six-digit code: the same sign-in as the website, without a browser.
class SignInForm : Form {
 readonly Settings settings;
 readonly TextBox emailBox = new TextBox(), codeBox = new TextBox();
 readonly Button send = new Button(), verify = new Button();
 readonly Label title = new Label(), help = new Label(), status = new Label();
 readonly LinkLabel other = new LinkLabel();

 public SignInForm(Settings settings) {
  this.settings = settings;
  Text = "Heartbeat"; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false; StartPosition = FormStartPosition.CenterScreen;
  ClientSize = new Size(420, 300); BackColor = Color.FromArgb(7, 11, 16); ForeColor = Color.FromArgb(242, 240, 231); Font = new Font("Segoe UI", 10f);
  ShowInTaskbar = true; Icon = Render.TrayIcon();
  title.SetBounds(28, 24, 364, 40); title.Font = new Font("Segoe UI Semilight", 18f); title.Text = "Come on in.";
  help.SetBounds(28, 70, 364, 44); help.ForeColor = Color.FromArgb(166, 171, 176); help.Text = "Enter the email you were invited with. We'll send you a six-digit code.";
  Style(emailBox); emailBox.SetBounds(28, 124, 364, 30);
  Style(codeBox); codeBox.SetBounds(28, 124, 364, 30); codeBox.MaxLength = 6; codeBox.Visible = false; codeBox.Font = new Font("Segoe UI", 16f); codeBox.TextAlign = HorizontalAlignment.Center;
  codeBox.TextChanged += (s, e) => { string digits = new string(codeBox.Text.Where(char.IsDigit).ToArray()); if (digits != codeBox.Text) codeBox.Text = digits; if (digits.Length == 6) Verify(); };
  Accent(send); send.SetBounds(28, 172, 364, 40); send.Text = "Send my code"; send.Click += (s, e) => Send();
  Accent(verify); verify.SetBounds(28, 172, 364, 40); verify.Text = "Sign in"; verify.Visible = false; verify.Click += (s, e) => Verify();
  status.SetBounds(28, 220, 364, 40); status.ForeColor = Color.FromArgb(252, 160, 140);
  other.SetBounds(28, 264, 364, 22); other.Text = "Use another email"; other.LinkColor = Color.FromArgb(252, 104, 75); other.Visible = false; other.LinkClicked += (s, e) => Step(false);
  AcceptButton = send;
  Controls.AddRange(new Control[] { title, help, emailBox, codeBox, send, verify, status, other });
 }
 static void Style(TextBox box) { box.BorderStyle = BorderStyle.FixedSingle; box.BackColor = Color.FromArgb(17, 23, 29); box.ForeColor = Color.FromArgb(242, 240, 231); }
 static void Accent(Button b) { b.FlatStyle = FlatStyle.Flat; b.FlatAppearance.BorderSize = 0; b.BackColor = Color.FromArgb(252, 104, 75); b.ForeColor = Color.FromArgb(22, 10, 6); b.Font = new Font("Segoe UI Semibold", 10.5f); b.Cursor = Cursors.Hand; }
 void Step(bool code) {
  emailBox.Visible = send.Visible = !code; codeBox.Visible = verify.Visible = other.Visible = code; status.Text = "";
  title.Text = code ? "Check your email." : "Come on in.";
  help.Text = code ? "We sent a code to " + emailBox.Text.Trim() + ". It works for 10 minutes." : "Enter the email you were invited with. We'll send you a six-digit code.";
  AcceptButton = code ? verify : send; (code ? (Control)codeBox : emailBox).Focus(); if (code) codeBox.Text = "";
 }
 async void Send() {
  send.Enabled = false; status.Text = "Sending…";
  try { await new Api(settings.Server, "").Post("/api/product/app/code/send", new Dictionary<string, object> { { "email", emailBox.Text.Trim() } }); Step(true); }
  catch (Exception e) { status.Text = e.Message; } finally { send.Enabled = true; }
 }
 bool verifying;
 async void Verify() {
  if (verifying || codeBox.Text.Length != 6) return; verifying = true; verify.Enabled = false; status.Text = "One moment…";
  try {
   var result = await new Api(settings.Server, "").Post("/api/product/app/code/verify", new Dictionary<string, object> { { "email", emailBox.Text.Trim() }, { "code", codeBox.Text }, { "platform", "windows" }, { "deviceName", Environment.MachineName } });
   Settings.SetToken(App.Str(result, "token")); settings.Email = App.Str(result, "email"); settings.Save(); Close();
  } catch (Exception e) { status.Text = e.Message; codeBox.SelectAll(); }
  finally { verifying = false; verify.Enabled = true; }
 }
}

/// The screensaver itself: one full-screen window per monitor, sharing one refresh loop.
class SaverContext : ApplicationContext {
 readonly List<SaverForm> forms = new List<SaverForm>();
 readonly Settings settings = Settings.Load();
 readonly string session = Guid.NewGuid().ToString();
 readonly System.Windows.Forms.Timer loop = new System.Windows.Forms.Timer();
 int seconds, nextCheck;
 string shownId = "";

 public SaverContext() {
  var info = Cache.Info();
  Image picture = null; try { if (File.Exists(App.PicturePath)) picture = Render.LoadFile(App.PicturePath); } catch { }
  string message = Settings.Token() == "" ? "Open Heartbeat from the Start menu to sign in." : picture == null ? "Your first picture is on its way…" : "";
  foreach (var screen in Screen.AllScreens) {
   var form = new SaverForm(screen.Bounds, () => ExitThread());
   form.Caption = Cache.Caption(info); form.Message = message; if (picture != null) form.Show(picture);
   form.Show(); forms.Add(form);
  }
  if (picture != null) { shownId = App.Str(info, "id"); picture.Dispose(); }
  KeepAwake();
  loop.Interval = 1000; loop.Tick += (s, e) => Second(); loop.Start();
  Check();
 }

 /// Keeps the display lit like a picture frame while plugged in; on battery Windows still sleeps normally.
 void KeepAwake() {
  if (settings.KeepScreenOn && App.OnMains) Native.SetThreadExecutionState(Native.Continuous | Native.DisplayRequired | Native.SystemRequired);
  else Native.SetThreadExecutionState(Native.Continuous);
 }

 void Second() {
  seconds++;
  foreach (var f in forms) f.Tick();
  if (seconds % 60 == 0) { KeepAwake(); Presence(); }
  if (seconds >= nextCheck) Check();
 }

 async void Presence() {
  string token = Settings.Token(); if (token == "") return;
  try { await new Api(settings.Server, token).Post("/api/product/app/presence", new Dictionary<string, object> { { "session", session }, { "surface", "screensaver" } }); } catch { }
 }

 bool checking;
 async void Check() {
  if (checking) return; checking = true; nextCheck = seconds + 60;
  try {
   var state = await Cache.Refresh(settings, !settings.Paused);
   if (state == null) { foreach (var f in forms) f.Message = "Open Heartbeat from the Start menu to sign in."; return; }
   if (seconds < 5) Presence();
   var info = Cache.Info(); string id = App.Str(info, "id");
   // While a picture is being made, look again sooner.
   if (App.Truthy(state, "making")) nextCheck = seconds + 20;
   foreach (var f in forms) { f.Caption = Cache.Caption(info); f.Message = App.Truthy(state, "ready") ? "" : App.Str(state, "reason"); }
   if (id != "" && id != shownId && File.Exists(App.PicturePath)) {
    using (var image = Render.LoadFile(App.PicturePath)) foreach (var f in forms) f.Show(image);
    shownId = id; foreach (var f in forms) f.Message = "";
   }
  } catch { /* offline or the server is asleep: keep showing the last picture */ }
  finally { checking = false; }
 }

 protected override void ExitThreadCore() { Native.SetThreadExecutionState(Native.Continuous); foreach (var f in forms.ToArray()) { try { f.Close(); } catch { } } base.ExitThreadCore(); }
}

class SaverForm : Form {
 Bitmap current, next; float fade; DateTime fadeStart;
 Point? origin; string lastMinute = "";
 public string Caption = "", Message = "";
 const double FadeSeconds = 3.2;

 public SaverForm(Rectangle bounds, Action quit) {
  FormBorderStyle = FormBorderStyle.None; StartPosition = FormStartPosition.Manual; Bounds = bounds; TopMost = true; ShowInTaskbar = false;
  BackColor = Color.Black; DoubleBuffered = true; SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer, true);
  Cursor.Hide();
  MouseMove += (s, e) => { if (origin == null) origin = e.Location; else if (Math.Abs(e.X - origin.Value.X) + Math.Abs(e.Y - origin.Value.Y) > 12) quit(); };
  MouseDown += (s, e) => quit(); KeyDown += (s, e) => quit();
 }
 /// Fit once per picture, so each frame of the fade is a cheap blend.
 public void Show(Image image) {
  var fitted = Render.Fit(image, ClientSize);
  if (current == null) { current = fitted; Invalidate(); return; }
  if (next != null) { current.Dispose(); current = next; }
  next = fitted; fade = 0; fadeStart = DateTime.UtcNow;
 }
 /// Called every second; runs a smooth fade only while one is in progress.
 public void Tick() {
  string minute = DateTime.Now.ToString("HH:mm");
  if (minute != lastMinute) { lastMinute = minute; Invalidate(); }
  if (next != null && !fading) { fading = true; FadeLoop(); }
 }
 bool fading;
 async void FadeLoop() {
  while (next != null) {
   fade = (float)Math.Min(1, (DateTime.UtcNow - fadeStart).TotalSeconds / FadeSeconds);
   Invalidate();
   if (fade >= 1) { current.Dispose(); current = next; next = null; Invalidate(); break; }
   await Task.Delay(33);
  }
  fading = false;
 }
 protected override void OnPaint(PaintEventArgs e) {
  var g = e.Graphics; g.CompositingQuality = CompositingQuality.HighSpeed; g.InterpolationMode = InterpolationMode.NearestNeighbor;
  if (current != null) g.DrawImageUnscaled(current, 0, 0); else g.Clear(Color.Black);
  if (next != null) {
   var matrix = new ColorMatrix { Matrix33 = fade };
   using (var attributes = new ImageAttributes()) { attributes.SetColorMatrix(matrix); g.DrawImage(next, new Rectangle(0, 0, next.Width, next.Height), 0, 0, next.Width, next.Height, GraphicsUnit.Pixel, attributes); }
  }
  Render.Overlay(g, ClientSize, DateTime.Now.ToString("HH:mm"), Caption);
  if (Message != "") using (var font = new Font("Segoe UI", Math.Max(12f, ClientSize.Height / 60f))) using (var brush = new SolidBrush(Color.FromArgb(200, 255, 255, 255))) {
   var size = g.MeasureString(Message, font); g.DrawString(Message, font, brush, (ClientSize.Width - size.Width) / 2, ClientSize.Height * 0.45f);
  }
 }
 protected override void OnFormClosed(FormClosedEventArgs e) { Cursor.Show(); if (current != null) current.Dispose(); if (next != null) next.Dispose(); base.OnFormClosed(e); }
}

/// The little preview inside Windows' Screen Saver Settings: the cached picture, no network.
class PreviewForm : Form {
 Bitmap picture;
 public PreviewForm(IntPtr parent) {
  FormBorderStyle = FormBorderStyle.None; BackColor = Color.Black; DoubleBuffered = true; ShowInTaskbar = false;
  Native.SetParent(Handle, parent); Native.SetWindowLong(Handle, -16, Native.GetWindowLong(Handle, -16) | 0x40000000);
  Native.RECT r; Native.GetClientRect(parent, out r); Bounds = new Rectangle(0, 0, r.Right, r.Bottom);
  try { if (File.Exists(App.PicturePath)) using (var image = Render.LoadFile(App.PicturePath)) picture = Render.Fit(image, Size); } catch { }
 }
 protected override void OnPaint(PaintEventArgs e) { if (picture != null) e.Graphics.DrawImageUnscaled(picture, 0, 0); }
}

/// `Heartbeat.exe --self-test`: checks the parts that don't need a screen or the network.
static class SelfTest {
 static int failures;
 static void Check(bool ok, string name) { if (!ok) { failures++; Console.Error.WriteLine("FAIL " + name); } else Console.WriteLine("ok   " + name); }
 public static int Run() {
  Check(App.Mode(new string[0]) == "default", "no arguments installs or opens the tray");
  Check(App.Mode(new[] { "/s" }) == "screen" && App.Mode(new[] { "/S" }) == "screen", "/s shows the screensaver");
  Check(App.Mode(new[] { "/c:1234" }) == "config" && App.Mode(new[] { "/p", "99" }) == "preview", "/c and /p");
  Check(App.PreviewHandle(new[] { "/p", "123" }).ToInt64() == 123 && App.PreviewHandle(new[] { "/p:456" }).ToInt64() == 456 && App.PreviewHandle(new[] { "/p" }) == IntPtr.Zero, "preview window handle");
  Check(App.Mode(new[] { "--tray", "--welcome" }) == "tray" && App.Mode(new[] { "--uninstall" }) == "uninstall", "tray and uninstall");
  Check(App.AllowedServer("https://app.heartbeatart.co.uk/") && App.AllowedServer("http://localhost:8787/"), "allowed servers");
  Check(!App.AllowedServer("http://app.heartbeatart.co.uk/") && !App.AllowedServer("https://user:pw@x.example/") && !App.AllowedServer("http://192.168.1.5/") && !App.AllowedServer("nonsense"), "refuses unsafe servers");
  Check(App.Newer("1.0.1", "1.0.0") && App.Newer("1.10.0", "1.9.0") && !App.Newer("1.0.0", "1.0.0") && !App.Newer("0.9", "1.0.0") && !App.Newer("garbage", "1.0.0"), "version comparison");
  var wide = Render.Cover(new Size(1344, 768), new Size(1920, 1080));
  Check(wide.Width >= 1920 && wide.Height >= 1080 && wide.X <= 0 && wide.Y <= 0 && Math.Abs(wide.X + wide.Width / 2 - 960) <= 1, "landscape picture fills a 16:9 screen, centred");
  var tall = Render.Cover(new Size(1344, 768), new Size(1080, 1920));
  Check(tall.Height >= 1920 && tall.Width >= 1080 && Math.Abs(tall.Y + tall.Height / 2 - 960) <= 1, "landscape picture fills a portrait screen, centred");
  Check(Api.Address("https://app.heartbeatart.co.uk", "/api/product/app/art/abc-123") != null && Api.Address("https://app.heartbeatart.co.uk", "/api/product/app/state?showing=1") != null, "requests go to paths on the Heartbeat server");
  Check(Api.Address("https://app.heartbeatart.co.uk", "https://evil.example/x") == null && Api.Address("https://app.heartbeatart.co.uk", "//evil.example/x") == null && Api.Address("https://app.heartbeatart.co.uk", "@evil.example/x") == null
   && Api.Address("https://app.heartbeatart.co.uk", "/\\evil.example") == null && Api.Address("https://app.heartbeatart.co.uk", "/a/../../x") == null && !Api.SafeId("../x") && !Api.SafeId("a/b") && Api.SafeId("3f2a-01"), "the device key is never sent to another address");
  Check(App.Sha256(Encoding.UTF8.GetBytes("abc")) == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha-256 for update checks");
  const string signed = "Y55ULpbLFRkHiU47ZGhiV/bOU3tnwZ8SP31xFjjYk21gHL958Bi5YkAsZaat1/6nZUVVJHWVaNQZC+Y5M6D5nvYauzEIAAGJTpVDDimD1Ee4KhQD2U4qbIpwki7Kupjw16F91qhqGlAWxgdHZnz2AnBaU4uSX2mWT/se2Q+aUCUglPXvUHc+ULOskQIB6ZHjGydR049F9sbty+acKA9hBoQbYoN/Ce0nM6ay+VaoNThSRyrrff+0CktN17hXx9lBpkq4kBTSkCN+AtbjgJsnqFs2K/B0VZXSKyKDPq11YHW4bMw/tnN1jWDcJLcFw+fuEoFPU7d2PJdCZQyViLbSycSbGlJzLHRWI03PyBccb8DDjXMJOlw4RGiwqVTfmdamAKjmPRD7ggGG5HDpCj7OUBxf7jaQ2f0t8pqH9je623SgEUS3VHLWVl6xfCp/sp2YkhjKIPz166OS0oHSRWwsSxco3sVMhrhKwEHpBgmbKNs3EVCoNK/WrTx/QyDKURZp";
  string abc = App.Sha256(Encoding.UTF8.GetBytes("abc"));
  Check(Release.Verify(Release.Message("0.0.1", "/downloads/Heartbeat.exe", abc, "3"), signed), "a release signed with Heartbeat's key is accepted");
  Check(!Release.Verify(Release.Message("9.9.9", "/downloads/Heartbeat.exe", abc, "3"), signed) && !Release.Verify(Release.Message("0.0.1", "/downloads/Other.exe", abc, "3"), signed)
   && !Release.Verify(Release.Message("0.0.1", "/downloads/Heartbeat.exe", App.Sha256(new byte[0]), "3"), signed) && !Release.Verify(Release.Message("0.0.1", "/downloads/Heartbeat.exe", abc, "4"), signed), "a changed version, file, checksum or size is refused");
  Check(!Release.Verify(Release.Message("0.0.1", "/downloads/Heartbeat.exe", abc, "3"), "") && !Release.Verify(Release.Message("0.0.1", "/downloads/Heartbeat.exe", abc, "3"), "not base64!") && !Release.Verify(Release.Message("0.0.1", "/downloads/Heartbeat.exe", abc, "3"), Convert.ToBase64String(new byte[384])), "a missing or forged signature is refused");
  var state = App.Json.Deserialize<Dictionary<string, object>>("{\"ready\":true,\"making\":false,\"picture\":{\"id\":\"x\",\"url\":\"/api/product/app/art/x\"},\"temperature\":12,\"city\":\"London\",\"unit\":\"c\"}");
  Check(App.Truthy(state, "ready") && !App.Truthy(state, "making") && App.Str((Dictionary<string, object>)state["picture"], "url") == "/api/product/app/art/x", "reads the server's state");
  Check(Cache.Caption(state) == "12°C · London" && Cache.Caption(new Dictionary<string, object> { { "city", "Paris" } }) == "Paris" && Cache.Caption(new Dictionary<string, object> { { "temperature", 50 }, { "unit", "f" } }) == "50°F", "caption under the clock");
  var settings = App.Json.Deserialize<Settings>("{\"Server\":\"http://evil.example\",\"IdleMinutes\":0}");
  Check(settings != null, "settings load");
  Console.WriteLine(failures == 0 ? "All self-tests passed." : failures + " self-test(s) failed.");
  return failures == 0 ? 0 : 1;
 }
}
}

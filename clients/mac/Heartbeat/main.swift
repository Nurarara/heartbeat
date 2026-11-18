// Heartbeat for Mac: a menu-bar app that keeps the newest picture as the wallpaper and shows Heartbeat
// full-screen when the Mac is idle (its own screensaver). Everything clever happens on the server;
// see docs/api-for-apps.md. Built with clients/mac/build.sh (no Xcode project needed).
import AppKit
import IOKit.ps
import IOKit.pwr_mgt

let appVersion = "1.0.0"
let defaultServer = "https://app.heartbeatart.co.uk"

// MARK: - Storage

final class Store {
    static let shared = Store()
    let folder: URL
    private let settingsURL: URL, tokenURL: URL
    var settings: [String: Any]

    private init() {
        folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Heartbeat", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        settingsURL = folder.appendingPathComponent("settings.json"); tokenURL = folder.appendingPathComponent("device.key")
        settings = (try? JSONSerialization.jsonObject(with: Data(contentsOf: settingsURL))) as? [String: Any] ?? [:]
    }
    func save() { if let d = try? JSONSerialization.data(withJSONObject: settings) { try? d.write(to: settingsURL, options: .atomic) } }
    var server: String { let s = settings["server"] as? String ?? defaultServer; return s.hasPrefix("https://") || s.hasPrefix("http://localhost") || s.hasPrefix("http://127.0.0.1") ? s.trimmingCharacters(in: CharacterSet(charactersIn: "/")) : defaultServer }
    func bool(_ key: String, _ fallback: Bool) -> Bool { settings[key] as? Bool ?? fallback }
    func int(_ key: String, _ fallback: Int) -> Int { settings[key] as? Int ?? fallback }
    func set(_ key: String, _ value: Any?) { settings[key] = value; save() }

    /// The device key, readable only by this macOS user.
    var token: String {
        get { (try? String(contentsOf: tokenURL, encoding: .utf8)) ?? "" }
        set {
            if newValue.isEmpty { try? FileManager.default.removeItem(at: tokenURL); return }
            try? newValue.write(to: tokenURL, atomically: true, encoding: .utf8)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: tokenURL.path)
        }
    }
    var signedIn: Bool { token.count == 64 }
    var paused: Bool { (settings["pausedUntil"] as? Double ?? 0) > Date().timeIntervalSince1970 }
    var pictureURL: URL { folder.appendingPathComponent("current.jpg") }
    var info: [String: Any] {
        get { (try? JSONSerialization.jsonObject(with: Data(contentsOf: folder.appendingPathComponent("current.json")))) as? [String: Any] ?? [:] }
        set { if let d = try? JSONSerialization.data(withJSONObject: newValue) { try? d.write(to: folder.appendingPathComponent("current.json"), options: .atomic) } }
    }
}

// MARK: - Server

struct APIError: Error, LocalizedError { let status: Int; let message: String; var errorDescription: String? { message } }

enum API {
    static func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, token: String = Store.shared.token) async throws -> (Data, Int) {
        guard let url = URL(string: path.hasPrefix("http") ? path : Store.shared.server + path) else { throw APIError(status: 0, message: "Bad address") }
        var r = URLRequest(url: url, timeoutInterval: 40); r.httpMethod = method
        r.setValue("HeartbeatMac/\(appVersion)", forHTTPHeaderField: "User-Agent")
        if !token.isEmpty { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { r.httpBody = try JSONSerialization.data(withJSONObject: body); r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await URLSession.shared.data(for: r)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
    static func json(_ path: String, method: String = "GET", body: [String: Any]? = nil, token: String = Store.shared.token) async throws -> [String: Any] {
        let (data, status) = try await request(path, method: method, body: body, token: token)
        let value = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(status) else { throw APIError(status: status, message: value["error"] as? String ?? "Heartbeat couldn't be reached (\(status)).") }
        return value
    }

    /// Asks what to show (showing=true may start a new picture) and saves a new picture if there is one.
    @discardableResult
    static func refresh(showing: Bool) async throws -> [String: Any]? {
        let store = Store.shared; guard store.signedIn else { return nil }
        let state: [String: Any]
        do { state = try await json("/api/product/app/state" + (showing ? "?showing=1" : "")) }
        catch let e as APIError where e.status == 401 { store.token = ""; throw e }
        var info = store.info
        if let picture = state["picture"] as? [String: Any], let id = picture["id"] as? String, id != info["id"] as? String, let path = picture["url"] as? String {
            let (data, status) = try await request(path)
            guard status == 200, data.count > 4, data.prefix(2) == Data([0xFF, 0xD8]), data.suffix(2) == Data([0xFF, 0xD9]) else { throw APIError(status: status, message: "The picture was incomplete.") }
            try data.write(to: store.pictureURL, options: .atomic)
            info["id"] = id; info["title"] = picture["title"]
        }
        for key in ["city", "temperature", "unit", "mood", "email", "moods", "wallpaperMinutes"] { info[key] = state[key] ?? NSNull() }
        store.info = info
        return state
    }
}

func caption(_ info: [String: Any]) -> String {
    var parts: [String] = []
    if let t = info["temperature"] as? NSNumber { parts.append("\(t.intValue)°\((info["unit"] as? String) == "f" ? "F" : "C")") }
    if let city = info["city"] as? String, !city.isEmpty { parts.append(city) }
    return parts.joined(separator: " · ")
}

// MARK: - Power and idle

enum Power {
    static var onMains: Bool {
        guard let blob = IOPSCopyPowerSourcesInfo()?.takeRetainedValue() else { return true }
        return (IOPSGetProvidingPowerSourceType(blob)?.takeUnretainedValue() as String?) == kIOPMACPowerKey
    }
    /// Seconds since the last keyboard, mouse or trackpad input.
    static var idleSeconds: Double { CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: CGEventType(rawValue: ~0)!) }
    /// True when another app (a video, a call, a presentation) is keeping the display awake.
    static var someoneWatching: Bool {
        var raw: Unmanaged<CFDictionary>?
        guard IOPMCopyAssertionsByProcess(&raw) == kIOReturnSuccess, let byProcess = raw?.takeRetainedValue() as? [NSNumber: [[String: Any]]] else { return false }
        let me = NSNumber(value: ProcessInfo.processInfo.processIdentifier)
        for (pid, list) in byProcess where pid != me {
            for a in list { if let type = a["AssertType"] as? String, type == "PreventUserIdleDisplaySleep" || type == "NoDisplaySleepAssertion" { return true } }
        }
        return false
    }
}

// MARK: - Wallpaper

enum Wallpaper {
    static func apply() {
        let store = Store.shared
        guard FileManager.default.fileExists(atPath: store.pictureURL.path) else { return }
        if store.settings["previousWallpapers"] == nil {
            var previous: [String: String] = [:]
            for screen in NSScreen.screens { if let url = NSWorkspace.shared.desktopImageURL(for: screen) { previous[screen.localizedName] = url.path } }
            store.set("previousWallpapers", previous)
        }
        // macOS caches by file name: alternate between two files so each change shows.
        let a = store.folder.appendingPathComponent("wallpaper-a.jpg"), b = store.folder.appendingPathComponent("wallpaper-b.jpg")
        let target = store.settings["wallpaperFile"] as? String == "a" ? b : a
        try? FileManager.default.removeItem(at: target)
        guard (try? FileManager.default.copyItem(at: store.pictureURL, to: target)) != nil else { return }
        for screen in NSScreen.screens {
            try? NSWorkspace.shared.setDesktopImageURL(target, for: screen, options: [.imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue, .allowClipping: true])
        }
        store.set("wallpaperFile", target == a ? "a" : "b")
        store.set("wallpaperId", store.info["id"] as? String ?? "")
    }
    static func restore() {
        let store = Store.shared
        if let previous = store.settings["previousWallpapers"] as? [String: String] {
            for screen in NSScreen.screens { if let path = previous[screen.localizedName], FileManager.default.fileExists(atPath: path) { try? NSWorkspace.shared.setDesktopImageURL(URL(fileURLWithPath: path), for: screen, options: [:]) } }
        }
        store.set("previousWallpapers", nil); store.set("wallpaperId", "")
    }
}

// MARK: - Start at login (a per-user LaunchAgent; no admin rights)

enum LoginItem {
    static var plist: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/LaunchAgents/uk.co.heartbeatart.mac.plist") }
    static var enabled: Bool { FileManager.default.fileExists(atPath: plist.path) }
    static func set(_ on: Bool) {
        if !on { try? FileManager.default.removeItem(at: plist); return }
        guard let exe = Bundle.main.executablePath else { return }
        let dict: [String: Any] = ["Label": "uk.co.heartbeatart.mac", "ProgramArguments": [exe], "RunAtLoad": true, "LimitLoadToSessionType": "Aqua"]
        try? FileManager.default.createDirectory(at: plist.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? PropertyListSerialization.data(fromPropertyList: dict, format: .xml, options: 0) { try? data.write(to: plist, options: .atomic) }
    }
}

// MARK: - The full-screen picture (Heartbeat's own screensaver)

final class FrameView: NSView {
    private let imageLayer = CALayer(), clock = NSTextField(labelWithString: ""), detail = NSTextField(labelWithString: ""), message = NSTextField(labelWithString: "")
    override init(frame: NSRect) {
        super.init(frame: frame); wantsLayer = true; layer?.backgroundColor = NSColor.black.cgColor
        imageLayer.contentsGravity = .resizeAspectFill; imageLayer.frame = bounds; imageLayer.autoresizingMask = [.layerWidthSizable, .layerHeightSizable]; layer?.addSublayer(imageLayer)
        let unit = max(10, min(frame.width, frame.height) / 100)
        let shadow = NSShadow(); shadow.shadowColor = NSColor.black.withAlphaComponent(0.45); shadow.shadowBlurRadius = 8; shadow.shadowOffset = NSSize(width: 0, height: -2)
        for (field, size, weight) in [(clock, unit * 7, NSFont.Weight.light), (detail, unit * 1.9, .regular), (message, unit * 1.8, .regular)] {
            field.font = .systemFont(ofSize: size, weight: weight); field.textColor = NSColor.white.withAlphaComponent(0.92); field.shadow = shadow; field.translatesAutoresizingMaskIntoConstraints = false; addSubview(field)
        }
        NSLayoutConstraint.activate([
            clock.leadingAnchor.constraint(equalTo: leadingAnchor, constant: unit * 3.6), detail.leadingAnchor.constraint(equalTo: leadingAnchor, constant: unit * 4),
            detail.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -unit * 4), clock.bottomAnchor.constraint(equalTo: detail.topAnchor, constant: unit * 0.4),
            message.centerXAnchor.constraint(equalTo: centerXAnchor), message.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        tick()
    }
    required init?(coder: NSCoder) { nil }
    func tick() { let f = DateFormatter(); f.dateFormat = "HH:mm"; clock.stringValue = f.string(from: Date()) }
    func show(_ image: NSImage?, caption text: String, message note: String) {
        detail.stringValue = text; message.stringValue = note
        guard let image else { return }
        let fade = CATransition(); fade.type = .fade; fade.duration = imageLayer.contents == nil ? 0.6 : 3.2
        imageLayer.add(fade, forKey: "fade"); imageLayer.contents = image
    }
}

final class FrameWindow: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class Saver {
    private var windows: [FrameWindow] = [], views: [FrameView] = []
    private var monitor: Any?, timer: Timer?, assertion: IOPMAssertionID = 0, shownId = "", session = UUID().uuidString, seconds = 0, nextCheck = 0, origin: NSPoint?
    var showing: Bool { !windows.isEmpty }

    func show() {
        guard !showing else { return }
        let store = Store.shared
        for screen in NSScreen.screens {
            let w = FrameWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false, screen: screen)
            w.level = .screenSaver; w.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]; w.backgroundColor = .black; w.isOpaque = true; w.ignoresMouseEvents = false; w.acceptsMouseMovedEvents = true
            let v = FrameView(frame: NSRect(origin: .zero, size: screen.frame.size)); w.contentView = v
            w.setFrame(screen.frame, display: true); w.orderFrontRegardless(); windows.append(w); views.append(v)
        }
        NSApp.activate(ignoringOtherApps: true); windows.first?.makeKey(); NSCursor.hide()
        let info = store.info, image = NSImage(contentsOf: store.pictureURL)
        shownId = image == nil ? "" : info["id"] as? String ?? ""
        let note = !store.signedIn ? "Click the Heartbeat icon in the menu bar to sign in." : image == nil ? "Your first picture is on its way…" : ""
        for v in views { v.show(image, caption: caption(info), message: note) }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved, .leftMouseDown, .rightMouseDown, .keyDown, .scrollWheel, .otherMouseDown]) { [weak self] event in
            guard let self else { return event }
            if event.type == .mouseMoved {
                let p = NSEvent.mouseLocation
                if let o = self.origin { if abs(p.x - o.x) + abs(p.y - o.y) > 12 { self.close() } } else { self.origin = p }
                return nil
            }
            self.close(); return nil
        }
        keepAwake(); seconds = 0; nextCheck = 0; origin = nil; session = UUID().uuidString
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.second() }
    }

    func close() {
        guard showing else { return }
        timer?.invalidate(); timer = nil
        if let monitor { NSEvent.removeMonitor(monitor) }; monitor = nil
        if assertion != 0 { IOPMAssertionRelease(assertion); assertion = 0 }
        for w in windows { w.orderOut(nil) }; windows = []; views = []
        NSCursor.unhide()
        (NSApp.delegate as? AppDelegate)?.saverClosed()
    }

    /// Plugged in: keep the display on like a picture frame. On battery the display sleeps as usual.
    private func keepAwake() {
        let want = Store.shared.bool("keepScreenOn", true) && Power.onMains
        if want && assertion == 0 { IOPMAssertionCreateWithName(kIOPMAssertPreventUserIdleDisplaySleep as CFString, IOPMAssertionLevel(kIOPMAssertionLevelOn), "Heartbeat is showing" as CFString, &assertion) }
        if !want && assertion != 0 { IOPMAssertionRelease(assertion); assertion = 0 }
    }

    private func second() {
        seconds += 1
        if seconds % 20 == 0 { for v in views { v.tick() } }
        if seconds % 60 == 0 { keepAwake(); presence() }
        if seconds >= nextCheck { check() }
    }

    private func presence() {
        guard Store.shared.signedIn else { return }
        let body: [String: Any] = ["session": session, "surface": "screensaver"]
        Task { _ = try? await API.json("/api/product/app/presence", method: "POST", body: body) }
    }

    private var checking = false
    private func check() {
        guard !checking else { return }
        checking = true; nextCheck = seconds + 60
        let paused = Store.shared.paused
        Task { @MainActor in
            defer { self.checking = false }
            guard let state = try? await API.refresh(showing: !paused) else { return }
            if self.seconds < 5 { self.presence() }
            if state["making"] as? Bool == true { self.nextCheck = self.seconds + 20 }
            let info = Store.shared.info, id = info["id"] as? String ?? ""
            let note = state["ready"] as? Bool == false ? state["reason"] as? String ?? "" : ""
            let image = id != self.shownId ? NSImage(contentsOf: Store.shared.pictureURL) : nil
            if image != nil { self.shownId = id }
            for v in self.views { v.show(image, caption: caption(info), message: image != nil ? "" : note) }
            if image != nil, Store.shared.bool("wallpaper", true) { Wallpaper.apply() }
        }
    }
}

// MARK: - Sign in

final class SignInWindow: NSWindowController, NSTextFieldDelegate {
    private let title = NSTextField(labelWithString: "Come on in."), help = NSTextField(wrappingLabelWithString: "Enter the email you were invited with. We'll send you a six-digit code.")
    private let email = NSTextField(), code = NSTextField(), button = NSButton(title: "Send my code", target: nil, action: nil), status = NSTextField(wrappingLabelWithString: "")
    private var step = 0
    var onDone: (() -> Void)?

    init() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 300), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        w.title = "Heartbeat"; w.center(); w.isReleasedWhenClosed = false
        super.init(window: w)
        let stack = NSStackView(views: [title, help, email, code, button, status]); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 12
        stack.edgeInsets = NSEdgeInsets(top: 28, left: 28, bottom: 28, right: 28); stack.translatesAutoresizingMaskIntoConstraints = false
        w.contentView = NSView(); w.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: w.contentView!.leadingAnchor), stack.trailingAnchor.constraint(equalTo: w.contentView!.trailingAnchor), stack.topAnchor.constraint(equalTo: w.contentView!.topAnchor)])
        title.font = .systemFont(ofSize: 24, weight: .light)
        for f in [email, code] { f.widthAnchor.constraint(equalToConstant: 364).isActive = true; f.font = .systemFont(ofSize: 15) }
        help.preferredMaxLayoutWidth = 364; status.preferredMaxLayoutWidth = 364; status.textColor = .systemRed
        email.placeholderString = "you@example.com"; code.placeholderString = "Six-digit code"; code.isHidden = true; code.delegate = self
        button.bezelStyle = .rounded; button.keyEquivalent = "\r"; button.target = self; button.action = #selector(go)
    }
    required init?(coder: NSCoder) { nil }

    func controlTextDidChange(_ obj: Notification) {
        let digits = code.stringValue.filter(\.isNumber); if digits != code.stringValue { code.stringValue = String(digits.prefix(6)) }
        if digits.count == 6 { go() }
    }

    @objc private func go() {
        button.isEnabled = false; status.textColor = .secondaryLabelColor; status.stringValue = step == 0 ? "Sending…" : "One moment…"
        let address = email.stringValue.trimmingCharacters(in: .whitespaces), digits = code.stringValue
        Task { @MainActor in
            defer { self.button.isEnabled = true }
            do {
                if self.step == 0 {
                    _ = try await API.json("/api/product/app/code/send", method: "POST", body: ["email": address], token: "")
                    self.step = 1; self.email.isHidden = true; self.code.isHidden = false; self.button.title = "Sign in"
                    self.title.stringValue = "Check your email."; self.help.stringValue = "We sent a code to \(address). It works for 10 minutes."; self.status.stringValue = ""
                    self.window?.makeFirstResponder(self.code)
                } else {
                    guard digits.count == 6 else { self.status.stringValue = ""; return }
                    let r = try await API.json("/api/product/app/code/verify", method: "POST", body: ["email": address, "code": digits, "platform": "mac", "deviceName": Host.current().localizedName ?? "Mac"], token: "")
                    Store.shared.token = r["token"] as? String ?? ""; Store.shared.set("email", r["email"] as? String ?? address)
                    self.close(); self.onDone?()
                }
            } catch { self.status.textColor = .systemRed; self.status.stringValue = error.localizedDescription; if self.step == 1 { self.code.stringValue = "" } }
        }
    }
}

// MARK: - The app (menu bar)

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var item: NSStatusItem!
    private let saver = Saver()
    private var signIn: SignInWindow?
    private var timer: Timer?, minutes = 0, locked = false, lastSaverEnd = Date.distantPast, update: String?

    func applicationDidFinishLaunching(_ notification: Notification) {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "waveform.path.ecg", accessibilityDescription: "Heartbeat")
        let menu = NSMenu(); menu.delegate = self; item.menu = menu
        let dnc = DistributedNotificationCenter.default()
        dnc.addObserver(forName: .init("com.apple.screenIsLocked"), object: nil, queue: .main) { [weak self] _ in self?.locked = true; self?.saver.close() }
        dnc.addObserver(forName: .init("com.apple.screenIsUnlocked"), object: nil, queue: .main) { [weak self] _ in self?.locked = false }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.screensDidSleepNotification, object: nil, queue: .main) { [weak self] _ in self?.saver.close() }
        if Store.shared.settings["welcomed"] == nil { welcome() }
        if Store.shared.signedIn { Task { await self.refresh(force: true) } } else { showSignIn() }
        // Every 5 seconds: is it time for the screensaver? Every minute: wallpaper and background check.
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.tick() }
        Task { await self.checkUpdate() }
    }

    /// First run: ask where Heartbeat should show.
    private func welcome() {
        let alert = NSAlert(); alert.messageText = "Welcome to Heartbeat"
        alert.informativeText = "Heartbeat paints a new picture for your time, weather and mood. Where should it show on this Mac?"
        let wall = NSButton(checkboxWithTitle: "Use as my wallpaper", target: nil, action: nil); wall.state = .on
        let saverBox = NSButton(checkboxWithTitle: "Show full-screen when my Mac is idle (screensaver)", target: nil, action: nil); saverBox.state = .on
        let login = NSButton(checkboxWithTitle: "Start Heartbeat when I log in", target: nil, action: nil); login.state = .on
        let stack = NSStackView(views: [wall, saverBox, login]); stack.orientation = .vertical; stack.alignment = .leading; stack.frame = NSRect(x: 0, y: 0, width: 360, height: 76)
        alert.accessoryView = stack; alert.addButton(withTitle: "Continue")
        NSApp.activate(ignoringOtherApps: true); alert.runModal()
        let s = Store.shared; s.set("wallpaper", wall.state == .on); s.set("screensaver", saverBox.state == .on); s.set("welcomed", true); LoginItem.set(login.state == .on)
    }

    private func showSignIn() {
        if signIn == nil { signIn = SignInWindow(); signIn?.onDone = { [weak self] in self?.signedIn() } }
        NSApp.activate(ignoringOtherApps: true); signIn?.showWindow(nil); signIn?.window?.makeKeyAndOrderFront(nil)
    }

    private func signedIn() {
        signIn = nil
        Task { @MainActor in
            await self.refresh(force: true, showing: true)
            self.saver.show() // Straight away, once: see it.
        }
    }

    func saverClosed() { lastSaverEnd = Date() }

    private func tick() {
        let s = Store.shared
        let idleLimit = Double(s.int("idleMinutes", 2) * 60)
        if !saver.showing, s.bool("screensaver", true), !locked, Power.idleSeconds >= idleLimit, Date().timeIntervalSince(lastSaverEnd) > 30, !Power.someoneWatching { saver.show() }
        minutes += 5
        if minutes % 60 == 0 { Task { await self.refresh(force: false) } }
    }

    /// Background check: keeps the cached picture and wallpaper current; asks for a new picture for the wallpaper
    /// at the account's pace, only while someone is using the Mac.
    private func refresh(force: Bool, showing: Bool = false) async {
        let s = Store.shared; guard s.signedIn else { return }
        let pace = Double(max(2, s.info["wallpaperMinutes"] as? Int ?? 60)) * 60 * (Power.onMains ? 1 : 2)
        let last = s.settings["lastWallpaperRequest"] as? Double ?? 0
        let want = showing || (s.bool("wallpaper", true) && !s.paused && !locked && Power.idleSeconds < 600 && Date().timeIntervalSince1970 - last > pace)
        guard force || want || Int(Date().timeIntervalSince1970) % 900 < 60 else { applyWallpaperIfNew(); return }
        do {
            let state = try await API.refresh(showing: want && !s.paused)
            if want { s.set("lastWallpaperRequest", Date().timeIntervalSince1970) }
            if state?["making"] as? Bool == true { s.set("lastWallpaperRequest", Date().timeIntervalSince1970 - pace + 60) }
        } catch let e as APIError where e.status == 401 { showSignIn() } catch {}
        applyWallpaperIfNew()
    }

    private func applyWallpaperIfNew() {
        let s = Store.shared, id = s.info["id"] as? String ?? ""
        if s.bool("wallpaper", true), !id.isEmpty, id != s.settings["wallpaperId"] as? String { Wallpaper.apply() }
    }

    private func checkUpdate() async {
        guard let m = try? await API.json("/downloads/mac.json", token: ""), let v = m["version"] as? String, let url = m["url"] as? String, url.hasPrefix("/downloads/") else { return }
        if v.compare(appVersion, options: .numeric) == .orderedDescending { update = Store.shared.server + url }
    }

    // Menu
    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let s = Store.shared, info = s.info
        let head = NSMenuItem(title: s.signedIn ? "Heartbeat · \(s.settings["email"] as? String ?? "")" : "Heartbeat · not signed in", action: nil, keyEquivalent: ""); head.isEnabled = false; menu.addItem(head)
        menu.addItem(.separator())
        if !s.signedIn { add(menu, "Sign in…") { [weak self] in self?.showSignIn() } }
        else {
            let moods = NSMenu(); let current = info["mood"] as? String
            for m in info["moods"] as? [[String: Any]] ?? [] {
                guard let id = m["id"] as? String, let label = m["label"] as? String else { continue }
                let it = add(moods, label) { Task { _ = try? await API.json("/api/product/app/mood", method: "POST", body: ["mood": id]); _ = try? await API.refresh(showing: false) } }
                it.state = id == current ? .on : .off
            }
            let moodItem = NSMenuItem(title: "Mood", action: nil, keyEquivalent: ""); moodItem.submenu = moods; menu.addItem(moodItem)
            add(menu, "Show Heartbeat now") { [weak self] in self?.saver.show() }
            add(menu, s.paused ? "Resume new pictures" : "Pause new pictures for 1 hour") { s.set("pausedUntil", s.paused ? 0 : Date().timeIntervalSince1970 + 3600) }
            menu.addItem(.separator())
            add(menu, "Use as wallpaper").state = s.bool("wallpaper", true) ? .on : .off
            menu.items.last?.target = self; menu.items.last?.action = #selector(toggleWallpaper)
            add(menu, "Show when idle (screensaver)") { s.set("screensaver", !s.bool("screensaver", true)) }.state = s.bool("screensaver", true) ? .on : .off
            let after = NSMenu()
            for minutes in [1, 2, 5, 10, 15, 30] { add(after, minutes == 1 ? "1 minute" : "\(minutes) minutes") { s.set("idleMinutes", minutes) }.state = s.int("idleMinutes", 2) == minutes ? .on : .off }
            let afterItem = NSMenuItem(title: "Show after", action: nil, keyEquivalent: ""); afterItem.submenu = after; menu.addItem(afterItem)
            add(menu, "Keep screen on while plugged in") { s.set("keepScreenOn", !s.bool("keepScreenOn", true)) }.state = s.bool("keepScreenOn", true) ? .on : .off
            add(menu, "Start at login") { LoginItem.set(!LoginItem.enabled) }.state = LoginItem.enabled ? .on : .off
            menu.addItem(.separator())
            add(menu, "Open my studio (city, account)…") { NSWorkspace.shared.open(URL(string: s.server + "/app")!) }
            if let update { add(menu, "Update available: download…") { NSWorkspace.shared.open(URL(string: update)!) } }
            add(menu, "Sign out") { Task { _ = try? await API.json("/api/product/app/signout", method: "POST", body: [:]); s.token = "" } }
        }
        add(menu, "Quit Heartbeat") { NSApp.terminate(nil) }
    }

    @objc private func toggleWallpaper() {
        let s = Store.shared, on = !s.bool("wallpaper", true); s.set("wallpaper", on)
        if on { Wallpaper.apply() } else { Wallpaper.restore() }
    }

    @discardableResult
    private func add(_ menu: NSMenu, _ title: String, _ action: (() -> Void)? = nil) -> NSMenuItem {
        let it = ClosureItem(title: title, action: action); menu.addItem(it); return it
    }
}

final class ClosureItem: NSMenuItem {
    private let run: (() -> Void)?
    init(title: String, action: (() -> Void)?) {
        run = action; super.init(title: title, action: action == nil ? nil : #selector(fire), keyEquivalent: ""); target = self
    }
    required init(coder: NSCoder) { fatalError() }
    @objc private func fire() { run?() }
}

// `Heartbeat --self-test` checks the parts that need no screen or network.
if CommandLine.arguments.contains("--self-test") {
    var failures = 0
    func check(_ ok: Bool, _ name: String) { print((ok ? "ok   " : "FAIL ") + name); if !ok { failures += 1 } }
    check(caption(["temperature": NSNumber(value: 12), "unit": "c", "city": "London"]) == "12°C · London", "caption")
    check(caption(["city": "Paris"]) == "Paris", "caption without temperature")
    check("1.0.1".compare("1.0.0", options: .numeric) == .orderedDescending && "1.10.0".compare("1.9.0", options: .numeric) == .orderedDescending, "version comparison")
    check(Store.shared.server.hasPrefix("https://"), "safe default server")
    exit(failures == 0 ? 0 : 1)
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()

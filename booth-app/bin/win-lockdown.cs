using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

class KioskLockdown {
    private const int WH_KEYBOARD_LL = 13;
    private const int VK_LWIN = 0x5B;
    private const int VK_RWIN = 0x5C;
    private const int VK_TAB = 0x09;
    private const int VK_ESCAPE = 0x1B;
    private const int VK_NUMLOCK = 0x90;
    private const uint KEYEVENTF_EXTENDEDKEY = 0x1;
    private const uint KEYEVENTF_KEYUP = 0x2;

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
        public int vkCode;
        public int scanCode;
        public int flags;
        public int time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern short GetKeyState(int keyCode);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool EnableWindow(IntPtr hWnd, bool bEnable);

    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage([In] ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage([In] ref MSG lpMsg);

    private struct MSG {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public int pt_x;
        public int pt_y;
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);
    private static LowLevelKeyboardProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;

    public static void SetTaskbarVisible(bool visible) {
        try {
            int cmd = visible ? 5 : 0; // SW_SHOW = 5, SW_HIDE = 0
            IntPtr tray = FindWindow("Shell_TrayWnd", null);
            if (tray != IntPtr.Zero) {
                ShowWindow(tray, cmd);
                EnableWindow(tray, visible);
            }
            IntPtr sec = FindWindow("Shell_SecondaryTrayWnd", null);
            if (sec != IntPtr.Zero) {
                ShowWindow(sec, cmd);
                EnableWindow(sec, visible);
            }
        } catch (Exception) {}
    }

    public static void EnsureNumLockOn() {
        try {
            bool isNumLockOn = (GetKeyState(VK_NUMLOCK) & 1) != 0;
            if (!isNumLockOn) {
                keybd_event((byte)VK_NUMLOCK, 0x45, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
                keybd_event((byte)VK_NUMLOCK, 0x45, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
            }
        } catch (Exception) {}
    }

    public static void SetTouchpadEnabled(bool enabled) {
        try {
            using (var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad\Status")) {
                if (key != null) {
                    key.SetValue("Enabled", enabled ? 1 : 0, Microsoft.Win32.RegistryValueKind.DWord);
                }
            }
        } catch (Exception) {}
    }

    public static void Main(string[] args) {
        // If run with 'restore', restore taskbar & touchpad and exit immediately
        if (args.Length > 0 && args[0].ToLower() == "restore") {
            Cleanup();
            return;
        }

        SetTaskbarVisible(false);
        SetTouchpadEnabled(false);
        EnsureNumLockOn();

        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            _hookID = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
        }

        AppDomain.CurrentDomain.ProcessExit += (s, e) => Cleanup();
        Console.CancelKeyPress += (s, e) => Cleanup();

        Console.WriteLine("LOCKDOWN_ACTIVE");
        Console.Out.Flush();

        Thread stdinThread = new Thread(() => {
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (line.Trim().ToLower() == "exit" || line.Trim().ToLower() == "unlock") {
                    Cleanup();
                    Environment.Exit(0);
                }
            }
            Cleanup();
            Environment.Exit(0);
        });
        stdinThread.IsBackground = true;
        stdinThread.Start();

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0)) {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }

        Cleanup();
    }

    private static void Cleanup() {
        if (_hookID != IntPtr.Zero) {
            UnhookWindowsHookEx(_hookID);
            _hookID = IntPtr.Zero;
        }
        SetTaskbarVisible(true);
        SetTouchpadEnabled(true);
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            KBDLLHOOKSTRUCT kbd = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            int vkCode = kbd.vkCode;
            bool altDown = (kbd.flags & 0x20) != 0 || ((GetAsyncKeyState(0x12) & 0x8000) != 0);
            bool ctrlDown = (GetAsyncKeyState(0x11) & 0x8000) != 0;
            bool shiftDown = (GetAsyncKeyState(0x10) & 0x8000) != 0;
            bool winDown = ((GetAsyncKeyState(VK_LWIN) & 0x8000) != 0) || ((GetAsyncKeyState(VK_RWIN) & 0x8000) != 0);

            // 1. Allow Election Officer unlock combination: Ctrl+Alt+Shift+Q
            if (ctrlDown && altDown && shiftDown && (vkCode == 0x51 || vkCode == 0x71)) {
                return CallNextHookEx(_hookID, nCode, wParam, lParam);
            }

            // 2. Block ANY key if Windows key is involved (stops desktop switching, start menu, shortcuts)
            if (vkCode == VK_LWIN || vkCode == VK_RWIN || winDown) {
                return (IntPtr)1;
            }

            // 3. Block ANY key if Alt is down (stops Alt+Tab, Alt+Esc, Alt+F4, Alt+Space, etc.)
            if (altDown) {
                return (IntPtr)1;
            }

            // 4. Block ANY key if Ctrl is down (stops Ctrl+Esc, Ctrl+W, Ctrl+Shift+Esc, Ctrl+Win+Arrows, etc.)
            if (ctrlDown) {
                return (IntPtr)1;
            }

            // 5. Block Function keys F1 - F24
            if (vkCode >= 0x70 && vkCode <= 0x87) {
                return (IntPtr)1;
            }

            // 6. Block Escape, Apps/ContextMenu (0x5D), Sleep (0x5F), PrintScreen (0x2C)
            if (vkCode == VK_ESCAPE || vkCode == 0x5D || vkCode == 0x5F || vkCode == 0x2C) {
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
}

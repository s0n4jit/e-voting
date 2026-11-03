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
    private const int VK_F4 = 0x73;
    private const int VK_SPACE = 0x20;

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

    public static void Main(string[] args) {
        // If run with 'restore', just restore taskbar and exit immediately
        if (args.Length > 0 && args[0].ToLower() == "restore") {
            SetTaskbarVisible(true);
            return;
        }

        SetTaskbarVisible(false);
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

            // 2. Block any Windows key press or release
            if (vkCode == VK_LWIN || vkCode == VK_RWIN) {
                return (IntPtr)1;
            }

            // 3. Block ANY key pressed while the Windows key is down (e.g. Win+S, Win+R, Win+X, etc.)
            if (winDown) {
                return (IntPtr)1;
            }

            // 4. Block Alt key combinations: Alt+Tab, Alt+Esc, Alt+Space, Alt+F4
            if (altDown) {
                if (vkCode == VK_TAB || vkCode == VK_ESCAPE || vkCode == VK_SPACE || vkCode == VK_F4) {
                    return (IntPtr)1;
                }
            }

            // 5. Block Ctrl+Esc (Start Menu) and Ctrl+Shift+Esc (Task Manager)
            if (ctrlDown && vkCode == VK_ESCAPE) {
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
}

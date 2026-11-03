using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

class KioskLockdown {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;

    private const int VK_LWIN = 0x5B;
    private const int VK_RWIN = 0x5C;
    private const int VK_TAB = 0x09;
    private const int VK_ESCAPE = 0x1B;
    private const int VK_F4 = 0x73;
    private const int VK_SPACE = 0x20;

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

    private static void SetTaskbarVisible(bool visible) {
        try {
            int cmd = visible ? 5 : 0; // SW_SHOW = 5, SW_HIDE = 0
            IntPtr tray = FindWindow("Shell_TrayWnd", null);
            if (tray != IntPtr.Zero) ShowWindow(tray, cmd);
            IntPtr sec = FindWindow("Shell_SecondaryTrayWnd", null);
            if (sec != IntPtr.Zero) ShowWindow(sec, cmd);
        } catch (Exception) {}
    }

    public static void Main(string[] args) {
        SetTaskbarVisible(false);
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule) {
            _hookID = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
        }

        AppDomain.CurrentDomain.ProcessExit += (s, e) => Cleanup();
        Console.CancelKeyPress += (s, e) => Cleanup();

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
            int vkCode = Marshal.ReadInt32(lParam);

            // Block Windows Keys (Left and Right)
            if (vkCode == VK_LWIN || vkCode == VK_RWIN) {
                return (IntPtr)1;
            }

            // Block Alt+Tab, Alt+Esc, Alt+Space, Alt+F4
            bool altDown = (GetAsyncKeyState(0x12) & 0x8000) != 0;
            if (altDown) {
                bool ctrlDown = (GetAsyncKeyState(0x11) & 0x8000) != 0;
                bool shiftDown = (GetAsyncKeyState(0x10) & 0x8000) != 0;
                // Allow Ctrl+Alt+Shift+Q (officer exit shortcut)
                if (ctrlDown && shiftDown && (vkCode == 0x51 || vkCode == 0x71)) {
                    return CallNextHookEx(_hookID, nCode, wParam, lParam);
                }
                if (vkCode == VK_TAB || vkCode == VK_ESCAPE || vkCode == VK_SPACE || vkCode == VK_F4) {
                    return (IntPtr)1;
                }
            }

            // Block Ctrl+Esc
            bool ctrl = (GetAsyncKeyState(0x11) & 0x8000) != 0;
            if (ctrl && vkCode == VK_ESCAPE) {
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }
}

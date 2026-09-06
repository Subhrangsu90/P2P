using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace RemoteInput
{
    class Program
    {
        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        static void Main(string[] args)
        {
            Console.WriteLine("READY");
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;
                if (line == "PING")
                {
                    Console.WriteLine("PONG");
                    continue;
                }
                if (line == "EXIT") break;

                try
                {
                    string[] parts = line.Split(' ');
                    string cmd = parts[0].ToUpper();

                    // Relative move: M <dx> <dy>
                    if (cmd == "M" && parts.Length >= 3)
                    {
                        int dx = int.Parse(parts[1]);
                        int dy = int.Parse(parts[2]);
                        POINT p;
                        if (GetCursorPos(out p))
                        {
                            SetCursorPos(p.X + dx, p.Y + dy);
                        }
                    }
                    // Absolute move: A <x> <y>
                    else if (cmd == "A" && parts.Length >= 3)
                    {
                        int x = int.Parse(parts[1]);
                        int y = int.Parse(parts[2]);
                        SetCursorPos(x, y);
                    }
                    // Mouse click: C <left|right|middle|double>
                    else if (cmd == "C" && parts.Length >= 2)
                    {
                        string btn = parts[1].ToLower();
                        if (btn == "left")
                        {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                        }
                        else if (btn == "right")
                        {
                            mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
                            mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
                        }
                        else if (btn == "middle")
                        {
                            mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, UIntPtr.Zero);
                            mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
                        }
                        else if (btn == "double")
                        {
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                            System.Threading.Thread.Sleep(50);
                            mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                            mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                        }
                    }
                    // Mouse down: D <left|right>
                    else if (cmd == "D" && parts.Length >= 2)
                    {
                        string btn = parts[1].ToLower();
                        if (btn == "left") mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                        else if (btn == "right") mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
                    }
                    // Mouse up: U <left|right>
                    else if (cmd == "U" && parts.Length >= 2)
                    {
                        string btn = parts[1].ToLower();
                        if (btn == "left") mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
                        else if (btn == "right") mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
                    }
                    // Mouse wheel scroll: W <deltaY>
                    else if (cmd == "W" && parts.Length >= 2)
                    {
                        int delta = int.Parse(parts[1]);
                        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
                    }
                    // Keystroke: K <escapedTextOrKey>
                    else if (cmd == "K" && line.Length > 2)
                    {
                        string keys = line.Substring(2);
                        SendKeys.SendWait(keys);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("ERR: " + ex.Message);
                }
            }
        }
    }
}

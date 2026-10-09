// dsh-notify-ar — click gateway.
//
// This is the process Windows launches when a toast button carrying a
// `dshnar://…` URI is pressed. It exists as a compiled executable because a
// probe on real hardware proved the notification broker refuses to launch
// `powershell.exe` or `cmd.exe` as a protocol handler — only a real .exe fires
// (see PROBE-REPORT.md, rule 3).
//
// Its whole job is tiny and must stay reliable:
//   1. take the activation URI from argv
//   2. append one JSON line to the bridge file the host plugin tails
//   3. exit immediately
//
// Two constraints learned the hard way:
//   - The activated process starts with cwd = C:\Windows\system32, so every
//     path arrives as an absolute command-line argument.
//   - It runs with no inherited context, so it must never depend on env vars.
//
// The bridge file is the security boundary: it is append-only from our side,
// and every URI in it must carry a single-use nonce the plugin minted. A line
// that fails that check is ignored by the plugin, not by this exe — this exe
// has no way to tell a real click from a forged line, so it never decides.
//
// Build: csc.exe /target:winexe /out:click-gateway.exe click-gateway.cs
//        (compiled locally by scripts/setup.mjs; never shipped as a binary)

using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

internal static class ClickGateway
{
    private const string MutexName = "Global\\dsh-notify-ar-click-gateway";

    private static int Main(string[] args)
    {
        string logPath = null;
        string diagPath = null;
        string uri = null;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--log":
                    if (i + 1 < args.Length) logPath = args[++i];
                    break;
                case "--diag":
                    if (i + 1 < args.Length) diagPath = args[++i];
                    break;
                default:
                    // Windows may hand the URI as the only bare argument.
                    if (uri == null) uri = args[i];
                    break;
            }
        }

        if (string.IsNullOrEmpty(uri))
        {
            WriteDiag(diagPath, "no-uri");
            return 2;
        }

        // Only our own scheme is ours to record; anything else is a stray
        // association and must not reach the bridge file.
        if (!uri.StartsWith("dshnar://", StringComparison.OrdinalIgnoreCase))
        {
            WriteDiag(diagPath, "foreign-scheme: " + uri);
            return 3;
        }

        if (string.IsNullOrEmpty(logPath))
        {
            WriteDiag(diagPath, "no-log-path");
            return 4;
        }

        Append(logPath, uri);
        WriteDiag(diagPath, "recorded: " + uri);
        return 0;
    }

    /// <summary>
    /// Append one JSON line. A named mutex serialises concurrent activations
    /// (pressing two toasts quickly must not interleave half-written lines),
    /// and the line is written with a real newline because the plugin's reader
    /// only accepts complete lines.
    /// </summary>
    private static void Append(string path, string uri)
    {
        string line = "{\"ts\":\"" + DateTime.Now.ToString("o", CultureInfo.InvariantCulture)
            + "\",\"arg\":\"" + JsonEscape(uri) + "\"}" + "\n";

        bool lockTaken = false;
        System.Threading.Mutex mutex = null;
        try
        {
            mutex = new System.Threading.Mutex(false, MutexName);
            try
            {
                lockTaken = mutex.WaitOne(TimeSpan.FromSeconds(5));
            }
            catch (AbandonedMutexException)
            {
                lockTaken = true;
            }

            string dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            using (FileStream stream = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
            using (StreamWriter writer = new StreamWriter(stream, new UTF8Encoding(false)))
            {
                writer.Write(line);
                writer.Flush();
            }
        }
        catch (Exception error)
        {
            WriteDiag(Path.ChangeExtension(path, ".error.txt"), "append-failed: " + error.Message);
        }
        finally
        {
            if (mutex != null)
            {
                if (lockTaken) mutex.ReleaseMutex();
                mutex.Dispose();
            }
        }
    }

    /// <summary>Minimal JSON string escaping for the single `arg` field.</summary>
    private static string JsonEscape(string value)
    {
        StringBuilder builder = new StringBuilder(value.Length + 8);
        foreach (char c in value)
        {
            switch (c)
            {
                case '"': builder.Append("\\\""); break;
                case '\\': builder.Append("\\\\"); break;
                case '\b': builder.Append("\\b"); break;
                case '\f': builder.Append("\\f"); break;
                case '\n': builder.Append("\\n"); break;
                case '\r': builder.Append("\\r"); break;
                case '\t': builder.Append("\\t"); break;
                default:
                    if (c < ' ')
                    {
                        builder.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        builder.Append(c);
                    }
                    break;
            }
        }
        return builder.ToString();
    }

    /// <summary>
    /// Best-effort diagnostics. Failures here are swallowed on purpose: the
    /// click itself has already been recorded, and a diagnostic must never be
    /// the reason a click is lost.
    /// </summary>
    private static void WriteDiag(string path, string message)
    {
        if (string.IsNullOrEmpty(path)) return;
        try
        {
            string dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
            File.AppendAllText(
                path,
                DateTime.Now.ToString("o", CultureInfo.InvariantCulture) + "  " + message + Environment.NewLine,
                new UTF8Encoding(false));
        }
        catch
        {
            // Intentionally ignored.
        }
    }
}

Option Explicit

Dim shell, fso, appFolder, server, command, processEnvironment
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set processEnvironment = shell.Environment("PROCESS")

appFolder = fso.GetParentFolderName(WScript.ScriptFullName)
server = fso.BuildPath(appFolder, "pi_dashboard_server.py")
command = "pythonw.exe """ & server & """"

' Start the PI process directly from the signed-in desktop session. This keeps
' the Windows SSO/Kerberos token available and avoids a detached child process.
processEnvironment("PI_DASHBOARD_PORT") = "8096"
processEnvironment("PI_DASHBOARD_BIND") = "127.0.0.1"
processEnvironment("PI_DASHBOARD_UPSTREAM") = ""

' Window style 0 keeps the dashboard server completely hidden.
shell.Run command, 0, False
WScript.Sleep 2500
shell.Run "http://127.0.0.1:8096/?ui=centered-map#processSectionHeading", 1, False

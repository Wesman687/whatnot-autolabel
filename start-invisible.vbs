Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get the directory where this script is located
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Check if Node.js is available
On Error Resume Next
WshShell.Run "node --version", 0, True
If Err.Number <> 0 Then
    MsgBox "Error: Node.js not found!" & vbCrLf & "Please install Node.js from: https://nodejs.org", 16, "WhatnotAutoPrint"
    WScript.Quit
End If
On Error GoTo 0

' Start server completely hidden (no window at all)
serverCmd = "cmd /c cd /d """ & scriptDir & "\server"" && node server.js"
WshShell.Run serverCmd, 0, False

' Wait 3 seconds for server to start
WScript.Sleep 3000

' Start GUI (Electron window will be visible, but no command prompt)
guiCmd = "powershell -WindowStyle Hidden -Command ""cd '" & scriptDir & "'; npm start"""
WshShell.Run guiCmd, 0, False
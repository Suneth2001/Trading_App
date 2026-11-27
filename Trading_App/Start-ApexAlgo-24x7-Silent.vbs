Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
appDir = fso.GetParentFolderName(WScript.ScriptFullName) & "\backend"
shell.CurrentDirectory = appDir
shell.Run "cmd /c node src\index.js", 0, False
MsgBox "ApexAlgo Pro 24/7 Background Engine started silently! You can now control & monitor trades from your Phone or PC even if you close browser tabs.", 64, "ApexAlgo Pro 24/7 Engine"

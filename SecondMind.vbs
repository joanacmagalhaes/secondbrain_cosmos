Dim fso, dir, bat
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = dir & "\SecondMind-debug.bat"

' Window style 1 = normal visible window, so errors are always shown
CreateObject("WScript.Shell").Run "cmd /c """ & bat & """", 1, False

Dim fso, dir, bat
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
bat = dir & "\SecondMind-debug.bat"

' Window style 0 = hidden — use SecondMind-debug.bat if nothing appears
CreateObject("WScript.Shell").Run "cmd /c """ & bat & """", 0, False

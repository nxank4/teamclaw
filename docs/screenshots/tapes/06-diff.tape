Output docs/screenshots/diff.png
Set Shell "bash"
Set FontSize 16
Set Width 1400
Set Height 800
Set Theme "Catppuccin Mocha"
Set Padding 20
Set WindowBar Colorful
Set TypingSpeed 30ms

Hide
Type "export PATH=$HOME/.bun/bin:$HOME/.local/bin:/home/linuxbrew/.linuxbrew/bin:$PATH"
Enter
Sleep 300ms
Type "rm -rf ~/personal/openpawl-test-projects/demo-screenshots/diff-demo && mkdir -p ~/personal/openpawl-test-projects/demo-screenshots/diff-demo && cd ~/personal/openpawl-test-projects/demo-screenshots/diff-demo"
Enter
Sleep 500ms
Show

Type "openpawl"
Enter
Sleep 3s
Type "create a file called server.ts with an Express hello world server that has /health endpoint and graceful shutdown"
Enter
Sleep 90s
Screenshot docs/screenshots/diff.png
Sleep 500ms

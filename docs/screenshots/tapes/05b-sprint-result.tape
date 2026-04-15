Output docs/screenshots/sprint-result.png
Set Shell "bash"
Set FontSize 16
Set Width 1400
Set Height 800
Set Theme "Catppuccin Mocha"
Set Padding 20
Set WindowBar Colorful
Set TypingSpeed 50ms

Type "echo '=== Files created by OpenPawl sprint ===' && echo 'Provider: opencode-go | Model: minimax-m2.7 | Template: indie-hacker' && echo '' && tree ~/personal/openpawl-test-projects/demo-screenshots/sprint-demo/ 2>/dev/null || find ~/personal/openpawl-test-projects/demo-screenshots/sprint-demo/ -type f | head -30"
Enter
Sleep 3s
Screenshot docs/screenshots/sprint-result.png
Sleep 500ms

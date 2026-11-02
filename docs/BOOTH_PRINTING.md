# Booth printing, receipt copies and maintenance commands

After a vote is recorded, the booth prints a **vote copy** (Voter Slip ID and the choice for each position) so the voter can check it and drop it into the physical box. It prints **silently** and a **copy is saved on the booth machine's disk** first.

## How it works

Every booth machine runs a small **booth agent** (`evote-agent`, port 9631, this machine only). The booth page sends the receipt to it; the agent

1. saves it to `/var/lib/evote/receipts/<date>/<time>-<slip>.txt` and appends a line to `receipts.jsonl` (folder is private to root),
2. prints it to the printer through CUPS (`lp`), with no print dialog.

If the printer fails, the copy is still saved and the booth tells the voter to ask the desk. On a PC without the agent the browser's normal print dialog is used instead.

## Lab PC sign-in

The installer no longer signs the kiosk user in automatically. At start the login screen lists the users: the administrator picks their own account, or `evote` (password set during install) to start the booth. Install with `AUTOLOGIN=yes` (or run `sudo evote autologin on`) for a booth that starts by itself. The browser lock-down (no log out, no terminal, no user switching) applies to the `evote` user only; USB sticks are no longer blocked unless you install with `BLOCK_USB_STORAGE=yes`.

## Officer settings

Settings, **Booth printing**: switch printing on or off, set a printer name (empty = each booth's default printer) and the number of copies. Booths pick the change up within seconds.

## Connecting the printer (once per booth machine)

Lab PC (installed with `kiosk/ubuntu/setup-kiosk.sh`), as the administrator account:

```bash
sudo evote setup
```

Then open `http://127.0.0.1:9631/setup` on that machine: set the portal address, join Wi-Fi, find and add the USB/network printer, send a test page, press **Finish**.

## Maintenance commands

`sudo evote` opens a menu; `sudo evote <command>` runs one.

| Command | What it does |
|---|---|
| `status` | address, browser, agent, printer, saved receipts, network, disk |
| `reboot`, `shutdown` | restart or power off |
| `restart-browser`, `restart-agent` | restart the booth browser or the agent |
| `network status` / `wifi` / `connect SSID [PASSWORD]` / `dhcp` / `static IP/BITS GATEWAY DNS` / `restart` / `ping [HOST]` | network |
| `printer list` / `set NAME` / `test` / `status` / `queue` / `cancel` | printer |
| `receipts count` / `list [DATE]` / `show SLIP` / `check` / `export FOLDER` | read the saved copies, verify none is missing, copy them to a USB stick |
| `url show` / `url set ADDRESS` | portal address |
| `setup`, `setup-off`, `logs [N]`, `autologin on/off` | setup page, logs, automatic sign-in of the kiosk user |

## Keeping the receipts

* **Lab PC:** the installer keeps receipts in the administrator's private folder `~/.evote-receipts` (mode 700, owned by the account that ran the installer with `sudo`). The kiosk user cannot read it. Without a normal administrator account they go to `/var/lib/evote/receipts`.

A receipt links a Voter Slip ID to the choices made. Keep the disk and the export under the same control as the ballot box.

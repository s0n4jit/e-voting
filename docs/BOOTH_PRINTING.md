# Booth printing, receipt copies and maintenance commands

After a vote is recorded, the booth prints a **vote copy** (Voter Slip ID and the choice for each position) so the voter can check it and drop it into the physical box. It prints **silently** and a **copy is saved on the booth machine's disk** first.

## How it works

Every booth machine runs a small **booth agent** (`evote-agent`, port 9631, this machine only). The booth page sends the receipt to it; the agent

1. saves it to `/var/lib/evote/receipts/<date>/<time>-<slip>.txt` and appends a line to `receipts.jsonl` (folder is private to root),
2. prints it to the printer through CUPS (`lp`), with no print dialog.

If the printer fails, the copy is still saved and the booth tells the voter to ask the desk. On a PC without the agent the browser's normal print dialog is used instead.

## Officer settings

Settings, **Booth printing**: switch printing on or off, set a printer name (empty = each booth's default printer) and the number of copies. Booths pick the change up within seconds.

## Connecting the printer (once per booth machine)

Lab PC (installed with `kiosk/ubuntu/setup-kiosk.sh`) or Booth OS:

```bash
sudo evote setup
```

Then open `http://127.0.0.1:9631/setup` on that machine: set the portal address, join Wi-Fi, find and add the USB/network printer, send a test page, set the maintenance password, press **Finish**. On Booth OS the page opens by itself on first boot when no address was embedded.

## Maintenance commands

`sudo evote` opens a menu; `sudo evote <command>` runs one. On Booth OS press **Ctrl+Alt+F2** and log in as `evoteadmin` (set its password in the setup page): you get an `evote>` prompt that accepts only these commands.

| Command | What it does |
|---|---|
| `status` | address, browser, agent, printer, saved receipts, network, disk |
| `reboot`, `shutdown` | restart or power off |
| `restart-browser`, `restart-agent` | restart the booth browser or the agent |
| `network status` / `wifi` / `connect SSID [PASSWORD]` / `dhcp` / `static IP/BITS GATEWAY DNS` / `restart` / `ping [HOST]` | network |
| `printer list` / `set NAME` / `test` / `status` / `queue` / `cancel` | printer |
| `receipts count` / `list [DATE]` / `show SLIP` / `check` / `export FOLDER` | read the saved copies, verify none is missing, copy them to a USB stick |
| `url show` / `url set ADDRESS` | portal address |
| `setup`, `setup-off`, `logs [N]`, `password` | setup page, logs, maintenance password |

## Keeping the receipts

* **Lab PC:** receipts are on the PC's disk (`/var/lib/evote/receipts`).
* **Booth OS (live USB):** the system itself is not saved between restarts. To keep receipts and settings, make a partition or stick with the label **EVOTE-DATA** (for example `sudo mkfs.ext4 -L EVOTE-DATA /dev/sdX1`). The booth mounts it automatically and stores everything there. Without it, run `evote receipts export FOLDER` to a USB stick **before** shutting the booth down.

A receipt links a Voter Slip ID to the choices made. Keep the disk and the export under the same control as the ballot box.

## Not included yet

A disk installer for Booth OS with a graphical wizard. Use the lab-PC installer for a permanent booth, or the live USB with an EVOTE-DATA partition.

# Booth OS: a bootable voting booth

**Campus E-Voting Booth OS** is a small Linux image (Debian 12) that boots straight into the voting booth screen. There is no desktop, no taskbar and no way to open anything else. It runs from memory, so **nothing is installed and nothing is saved**: write it to a USB stick, boot a PC from the stick, and when you remove the stick and restart, the PC is exactly as it was.

## What it does

- Boots into a single full-screen Firefox on your booth address (`https://your-portal/kiosk/vote`), using the same browser policy as the Ubuntu kit: only that address can be opened, no developer tools, downloads or other sites.
- Turns off the text consoles (Ctrl+Alt+F2…), the SysRq key, Ctrl+Alt+Del and USB storage (keyboard and mouse still work). There is no password to guess and no SSH.
- The booth address is **put into the ISO after you download it**, with a tool that works on Windows, macOS and Linux.
- The booth needs a **wired network** with DHCP (plug a cable in). Wi-Fi is not set up.

## 1. Get the image

Download `evote-booth-os.iso` (and its `.sha256`) from the repository's **Releases** page (tags named `booth-os-v…`). Check the file against the `.sha256`.

## 2. Put your portal address into it

You need Python 3 (any computer) and the `embed-url.py` file from the `booth-os` folder of the repository:

```bash
python embed-url.py evote-booth-os.iso https://vote.example.edu/kiosk/vote
```

It changes the downloaded file in place and prints how many boot entries were updated. The address must end in `/kiosk/vote`. To use a different address later, download a fresh copy of the ISO.

## 3. Write it to a USB stick

Use [balenaEtcher](https://etcher.balena.io/), or Rufus in **DD image mode** (Windows), or:

```bash
sudo dd if=evote-booth-os.iso of=/dev/sdX bs=4M status=progress conv=fsync
```

Replace `/dev/sdX` with the stick (check with `lsblk`; the wrong device erases that disk). The same image boots on BIOS and UEFI PCs. Turn Secure Boot off if the PC refuses to start from the stick.

## 4. Boot a PC from it and approve the booth

1. Plug in the network cable, insert the stick and start the PC, using its boot menu key (often F12, F11 or Esc) to boot from USB.
2. The booth screen appears. It shows the set-up page of your portal.
3. In the officer panel go to **Voting booths**, generate a booth token, and enter it on the booth together with the officer's authenticator code. The booth is named `BOOTH-01`, `BOOTH-02`… automatically.

Because nothing is saved, **every start needs the booth approved again** (a new token and code). A stolen stick is therefore not a working booth.

## Remove it

Shut the PC down, remove the stick and start the PC. It boots its own system as before. In the officer panel, delete the booth if you want it gone at once.

## If the screen says "This voting booth has no portal address"

The address was not put into the ISO. Run `embed-url.py` again on a fresh download, or, for a quick test, edit the boot line once: in the boot menu press `e` (UEFI) or `Tab` (BIOS) and add `evote.url=https://vote.example.edu/kiosk/vote`.

## Physical security

Software cannot stop someone who can change the PC's boot settings. Set a firmware (BIOS/UEFI) password, allow booting only from the USB stick during the election, and cover or seal the other ports.

## Building it yourself

The image is built by the **Build Booth OS** workflow (Actions tab → Run workflow, or push a tag `booth-os-v1.0.0`). The recipe is in the `booth-os` folder: `auto/config` (settings), `config/package-lists` (software) and `config/includes.chroot` (the booth service and scripts). Locally you need Debian or Ubuntu with `live-build` installed: `sudo sh booth-os/build.sh` (about 15 minutes, 1 GB download).

## Not included (yet)

- Installing it permanently on a disk. For now it runs live from the stick.
- Wi-Fi, a persistent booth identity across restarts, and a firewall that allows only the portal address.

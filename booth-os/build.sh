#!/bin/sh
# Builds the Booth OS ISO. Needs Debian/Ubuntu with live-build (run as root): sudo sh booth-os/build.sh
set -e
cd "$(dirname "$0")"

# Boot menus wait forever by default; a booth should start by itself after a few seconds.
rm -rf config/bootloaders
mkdir -p config/bootloaders
for d in isolinux syslinux grub-pc; do cp -r "/usr/share/live/build/bootloaders/$d" config/bootloaders/; done
sed -i 's/^timeout 0/timeout 30/' config/bootloaders/isolinux/isolinux.cfg config/bootloaders/syslinux/syslinux.cfg
echo 'set timeout=3' >> config/bootloaders/grub-pc/config.cfg

# The booth agent and the evote command are shared with the lab-PC installer: copy them into the image.
mkdir -p config/includes.chroot/usr/local/lib/evote config/includes.chroot/usr/local/bin
cp ../booth-agent/evote-agent.py config/includes.chroot/usr/local/lib/evote/evote-agent.py
cp ../booth-agent/setup.html config/includes.chroot/usr/local/lib/evote/setup.html
cp ../booth-agent/evote config/includes.chroot/usr/local/bin/evote
cp ../booth-agent/evote-agent.service config/includes.chroot/etc/systemd/system/evote-agent.service

sh auto/config
lb build

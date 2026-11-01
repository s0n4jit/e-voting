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

sh auto/config
lb build

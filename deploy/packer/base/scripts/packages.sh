#! /bin/bash

set -e -v

DOCKER_VERSION=1.10.1-0~trusty
# Kernels < 3.13.0.77 and > 3.13.0.71 have an AUFS bug which can cause docker
# containers to not exit properly because of zombie processes that can't be reaped.
KERNEL_VERSION=3.13.0-79-generic

lsb_release -a

# add docker group and add current user to it
sudo groupadd docker
sudo usermod -a -G docker $USER

sudo apt-get update -y

[ -e /usr/lib/apt/methods/https ] || {
  apt-get install apt-transport-https
}

# Add docker gpg key and update sources
sudo apt-key adv --keyserver hkp://p80.pool.sks-keyservers.net:80 --recv-keys 58118E89F3A912897C070ADBF76221572C52609D
sudo sh -c "echo deb https://apt.dockerproject.org/repo ubuntu-trusty main\
> /etc/apt/sources.list.d/docker.list"

## Update to pick up new registries
sudo apt-get update -y

## Install all the packages
sudo apt-get install -y \
    unattended-upgrades \
    docker-engine=$DOCKER_VERSION \
    btrfs-tools \
    lvm2 \
    curl \
    build-essential \
    linux-image-$KERNEL_VERSION \
    linux-image-extra-$KERNEL_VERSION \
    linux-image-extra-virtual \
    git-core \
    pbuilder \
    python-mock \
    python-configobj \
    python-support \
    cdbs \
    python-pip \
    jq \
    rsyslog-gnutls \
    openvpn \
    v4l2loopback-utils \
    lxc

## Clear mounts created in base image so fstab is empty in other builds...
sudo sh -c 'echo "" > /etc/fstab'

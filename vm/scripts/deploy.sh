#! /bin/bash -vex

# source that needs to be untar'ed
source=$1
mkdir -p $HOME/worker
cd $HOME/worker
mkdir node_modules
sudo chown -R $USER:$USER /home/ubuntu/worker
npm install $source

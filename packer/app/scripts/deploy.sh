#! /bin/bash -vex

# source that needs to be untar'ed
source=$1
target=$HOME/worker
mkdir -p $target
cd $target
tar xzf $source -C $target --strip-components=1
sudo chown -R $USER:$USER /home/ubuntu/worker
npm install --production
npm rebuild

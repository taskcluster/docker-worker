#! /bin/bash -vex

registry=$(cat DOCKER_TAG)
version=$(cat VERSION)

make -C git
docker build --no-cache -t $registry:$version $PWD

echo "If deploying now you can run 'docker push $registry:$version'"

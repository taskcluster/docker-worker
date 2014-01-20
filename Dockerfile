from lightsofapollo/node:0.10.24
maintainer James Lal [:lightsofapollo]

env HOME /home/dockerworker
run useradd dockerworker --create-home
user dockerworker
workdir /home/dockerworker
add . /home/dockerworker/app
cmd cd /home/dockerworker/app && npm install

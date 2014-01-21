from lightsofapollo/node:0.10.24
maintainer James Lal [:lightsofapollo]

env HOME /home/dockerworker
run useradd dockerworker --create-home
add . /home/dockerworker/app
run chown -R dockerworker:dockerworker /home/dockerworker/
USER dockerworker
workdir /home/dockerworker/app
run npm install

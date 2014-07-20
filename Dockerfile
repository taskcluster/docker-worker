FROM lightsofapollo/ubuntu-node

RUN mkdir /worker
COPY . /worker/
WORKDIR /worker/

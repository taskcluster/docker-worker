FROM        gliderlabs/alpine:3.2
MAINTAINER  Jonas Finnemann Jensen <jopsen@gmail.com>

# Install dependencies
RUN         apk-install docker

# Add entrypoint
COPY        ./entrypoint.sh /bin/entrypoint.sh
RUN         chmod +x /bin/entrypoint.sh
ENTRYPOINT  /bin/entrypoint.sh

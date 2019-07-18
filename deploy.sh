#!/bin/bash -e

export BUILD_TARGET=$1
if [ -z "$BUILD_TARGET" ]; then
    echo "USAGE: ./deploy.sh <target> [options]  (base, app, etc.)" >&2
    echo " --test -- (for legacy deployment only) only deploy to ami-test, not all workers"
    ehco " --only='..' -- only build these packer builders"
    exit 1
fi
shift

export ONLY
for arg in "${*}"; do
    if [[ "x$arg" == x--only* ]]; then
        ONLY=${arg#-}
    fi
done

if [ "$TASKCLUSTER_ROOT_URL" == "" ]; then
    echo "TASKCLUSTER_ROOT_URL must be set" >&2
    exit 1
fi

export DEPLOYMENT
case "$TASKCLUSTER_ROOT_URL" in
    # note that these names correspond to the deployment names in taskcluster-mozilla-terraform
    https://taskcluster.net) DEPLOYMENT=taskcluster-net;;
    https://taskcluster-staging.net) DEPLOYMENT=taskcluster-staging-net;;
    https://*.taskcluster-dev.net) DEPLOYMENT=$(echo $TASKCLUSTER_ROOT_URL | sed 's!https://\(.*\)\.taskcluster-dev.net!\1!')-dev;;
    *)
        echo "Unrecognized TASKCLUSTER_ROOT_URL" >&2
        exit 1;;
esac

UPDATE_WORKER_TYPES=false
if [ "$DEPLOYMENT" == "taskcluster-net" -a "$BUILD_TARGET" == "app" ]; then
    UPDATE_WORKER_TYPES=true
fi

if $UPDATE_WORKER_TYPES; then
    if [ "$TASKCLUSTER_CLIENT_ID" == "" -o "$TASKCLUSTER_ACCESS_TOKEN" == "" ]; then
        echo "You don't seem to have proper Taskcluster credentials, please run 'taskcluster-cli signin' command" >&2
        exit 1
    fi
fi

echo "Configuring TC environment ${DEPLOYMENT}" >&2

export AWS_ACCOUNT
case "$DEPLOYMENT" in
    taskcluster-net) AWS_ACCOUNT=mozilla-taskcluster;;
    taskcluster-staging-net) AWS_ACCOUNT=taskcluster-aws-staging;;
    *-dev) AWS_ACCOUNT=taskcluster-aws-staging;;
    *)
        echo "No AWS account defined for this environment" >&2
        exit 1;;
esac

found=false
for alias in `aws iam list-account-aliases | jq -r '.AccountAliases[]'`; do
    if [ "$alias" == "$AWS_ACCOUNT" ]; then
        found=true
    fi
done
if ! $found; then
    echo "Not signed into AWS account $AWS_ACCOUNT - sign in and try again" >&2
    exit 1
fi
echo "Using AWS account $AWS_ACCOUNT" >&2

export GCP_PROJECT_ID
case "$DEPLOYMENT" in
    #taskcluster-net) GCP_PROJECT_ID=linux64-builds;;
    dustin-dev) GCP_PROJECT_ID=dustin-dev-3;;
    *)
        echo "No GCP project defined for this environment" >&2
        exit 1;;
esac

gcloud projects describe $GCP_PROJECT_ID >/dev/null
if [ $? != 0 ]; then
    echo "You do not have access to GCP project $GCP_PROJECT_ID"
    echo 'Try `gcloud auth login` or check your gcp account permissions'
    exit 1
fi
echo "Using GCP project $GCP_PROJECT_ID" >&2

NODE_VERSION_MAJOR=$(node --version | tr -d v | awk -F. '{print $1}')
NODE_VERSION_MINOR=$(node --version | tr -d v | awk -F. '{print $2}')
if [ 0$NODE_VERSION_MAJOR -lt 8 -o 0$NODE_VERSION_MAJOR -eq 8 -a 0$NODE_VERSION_MINOR -lt 15 ]; then
  echo "$0 requires node version 8.15.0 or higher." >&2
  exit 1
fi

if [ -z "$PASSWORD_STORE_DIR" ]; then
    export PASSWORD_STORE_DIR=$HOME/.password-store
fi

if ! [ -d $PASSWORD_STORE_DIR ]; then
    echo "Password store not found, please install it by running:"
    echo "git clone ssh://gitolite3@git-internal.mozilla.org/taskcluster/secrets.git $PASSWORD_STORE_DIR"
    echo "To clone this repository, you need Mozilla VPN access. Please check \
https://mana.mozilla.org/wiki/display/IT/Mozilla+VPN for information on how to setup VPN connection."
    exit 1
fi

deploy/bin/import-docker-worker-secrets
trap 'rm -rf /tmp/docker-worker*' EXIT
deploy/bin/build $BUILD_TARGET "$ONLY"

if $UPDATE_WORKER_TYPES; then
    deploy/bin/update-worker-types.js $*
else
    echo "Not deploying worker-types as this is not the taskcluster-net app deployment"
fi

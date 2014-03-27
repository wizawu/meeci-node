#!/bin/bash

if [[ $1 == "-h" || $# -ne 1 ]]; then
    echo "Usage: $0 <PORT>"
    exit 0
fi 

sudo mount --bind /var/lib/meeci/containers/ /srv/ftp/meeci/containers/
sudo /etc/init.d/vsftpd restart

if [[ `pgrep memcached` == '' ]]; then
    sudo /etc/init.d/memcached restart
fi

sudo MEECI_PORT=$1 node web/app

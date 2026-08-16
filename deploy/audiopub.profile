# Firejail profile for AudioPub (SvelteKit/Node audio server)
# Usage: firejail --profile=audiopub.profile -- /usr/bin/node build/index.js
# Hardening notes:
#  - caps.drop all: no Linux capabilities
#  - seccomp: syscall filter
#  - nonewprivs / noroot: cannot gain privileges
#  - loopback-only net (audiopub.netfilter); DB+Icecast on 127.0.0.1, tunnel hits 127.0.0.1:3000
#  - no sound/dbus/dvd, isolated /tmp and /dev, no groups
caps.drop all
seccomp
nonewprivs
noroot
nosound
nodbus
nodvd
nogroups
no3d
private-tmp
private-dev
netfilter audiopub.netfilter
protocol unix,inet,inet6

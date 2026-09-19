#!/usr/bin/env bash
# Certificats de développement pour la recette sur iPhone (lot 0, § 8, niveau C).
#
#   bash scripts/make-lan-cert.sh 192.168.1.28
#
# Produit, dans .certs/ (ignoré par git) :
#   - coach-jm-dev-ca.key / coach-jm-dev-ca.crt : une autorité racine locale,
#     nommée explicitement, valable 90 jours — c'est elle que l'iPhone reconnaît ;
#   - lan.key / lan.crt : le certificat du serveur, signé par cette autorité,
#     avec l'adresse IP en Subject Alternative Name, valable 30 jours.
#
# Exigences d'Apple pour un certificat serveur (iOS 13+) respectées : RSA 2048,
# SHA-256, SAN présent et concordant, ExtendedKeyUsage serverAuth, validité < 825 j.
# La clé de l'autorité ne quitte jamais ce dossier. Après la recette, retirer
# le profil de l'iPhone et supprimer .certs/.
set -euo pipefail

# Git Bash sur Windows réécrit les arguments qui ressemblent à des chemins (/CN=...) :
# on le désactive pour openssl.
export MSYS2_ARG_CONV_EXCL="*"

IP="${1:-}"
if [[ -z "$IP" ]]; then
  echo "Usage : bash scripts/make-lan-cert.sh <adresse IP du PC sur le Wi-Fi>" >&2
  exit 2
fi

DIR="$(cd "$(dirname "$0")/.." && pwd)/.certs"
mkdir -p "$DIR"
cd "$DIR"

if [[ ! -f coach-jm-dev-ca.key ]]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 90 \
    -keyout coach-jm-dev-ca.key -out coach-jm-dev-ca.crt \
    -subj "/CN=Coach JM - autorite de developpement (JMA)/O=Coach JM dev" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash"
  echo "Autorité créée : $DIR/coach-jm-dev-ca.crt"
else
  echo "Autorité existante réutilisée : $DIR/coach-jm-dev-ca.crt"
fi

cat > lan.ext <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
subjectAltName=IP:${IP},IP:127.0.0.1,DNS:localhost
EOF

openssl req -new -newkey rsa:2048 -sha256 -nodes \
  -keyout lan.key -out lan.csr \
  -subj "/CN=Coach JM serveur de recette ${IP}/O=Coach JM dev"

openssl x509 -req -in lan.csr -sha256 -days 30 \
  -CA coach-jm-dev-ca.crt -CAkey coach-jm-dev-ca.key -CAcreateserial \
  -extfile lan.ext -out lan.crt

rm -f lan.csr lan.ext
cp coach-jm-dev-ca.crt coach-jm-dev-ca.cer

echo
echo "Certificat serveur : $DIR/lan.crt"
openssl x509 -in lan.crt -noout -subject -issuer -dates -ext subjectAltName
echo
echo "Fichier à transmettre à l'iPhone (autorité seulement, jamais les .key) : $DIR/coach-jm-dev-ca.cer"
echo "Empreinte SHA-256 de l'autorité (à comparer sur l'iPhone) :"
openssl x509 -in coach-jm-dev-ca.crt -noout -fingerprint -sha256

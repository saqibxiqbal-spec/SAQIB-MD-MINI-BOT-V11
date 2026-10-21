#!/usr/bin/env bash
# Verify every sound filter chain produces non-silent audio via ffmpeg lavfi.
set -u
TMP=$(mktemp -d)
declare -A F
F[sound]="aevalsrc='0.4*sin(2*PI*880*t)*between(t,0,0.12)+0.4*sin(2*PI*660*t)*between(t,0.16,0.28)':d=0.35:s=44100"
F[sound2]="aevalsrc='0.5*sin(2*PI*1320*t)*exp(-6*t)':d=0.6:s=44100"
F[sound3]="aevalsrc='0.35*(sin(2*PI*523*t)*between(t,0,0.18)+sin(2*PI*659*t)*between(t,0.18,0.36)+sin(2*PI*784*t)*between(t,0.36,0.54)+sin(2*PI*1047*t)*between(t,0.54,0.75))':d=0.78:s=44100"
F[sound4]="aevalsrc='0.6*sin(2*PI*60*t)*exp(-4*t)+0.3*random(0)*exp(-8*t)':d=0.9:s=44100"
F[sound5]="aevalsrc='0.4*sin(2*PI*(2000-1500*t)*t)*exp(-3*t)':d=0.4:s=44100"
F[sound6]="aevalsrc='0.6*sin(2*PI*55*t)*exp(-8*mod(t,0.3))+0.25*sin(2*PI*1000*t)*exp(-40*mod(t,0.3))':d=1.2:s=44100"
F[sound7]="anoisesrc=d=0.5:c=pink:a=0.5,highpass=f=400,lowpass=f=6000,afade=t=in:d=0.1,afade=t=out:st=0.3:d=0.2"
F[sound8]="anoisesrc=d=0.25:c=white:a=0.8,lowpass=f=3000,afade=t=out:st=0.02:d=0.23"
F[sound9]="aevalsrc='0.4*sin(2*PI*180*t)*exp(-30*mod(t,0.08))':d=0.8:s=44100"
F[sound10]="aevalsrc='0.35*sin(2*PI*880*t+0.5*sin(2*PI*6*t))':d=0.8:s=44100"
F[sound11]="aevalsrc='0.3*(sin(2*PI*196*t)+0.5*sin(2*PI*392*t)+0.25*sin(2*PI*588*t))*exp(-2*t)':d=0.7:s=44100"
F[sound12]="aevalsrc='0.4*(sin(2*PI*440*t)+0.3*sin(2*PI*880*t))*exp(-3*t)':d=0.8:s=44100"
F[sound13]="aevalsrc='0.4*sin(2*PI*(100+800*t)*t)':d=1.0:s=44100"
F[sound14]="aevalsrc='0.3*(sin(2*PI*2500*t)+sin(2*PI*3700*t))*exp(-15*t)+0.2*random(0)*exp(-25*t)':d=0.4:s=44100"
F[sound15]="aevalsrc='0.4*(sin(2*PI*466*t)+0.5*sin(2*PI*932*t))*between(t,0,0.5)':d=0.55:s=44100"
F[sound16]="aevalsrc='0.25*(sin(2*PI*392*t)*between(t,0,0.3)+sin(2*PI*440*t)*between(t,0.3,0.6)+sin(2*PI*349*t)*between(t,0.6,0.9)+sin(2*PI*330*t)*between(t,0.9,1.3))':d=1.35:s=44100"

for k in "${!F[@]}"; do
  out="$TMP/$k.mp3"
  if ffmpeg -y -hide_banner -loglevel error -f lavfi -i "${F[$k]}" -c:a libmp3lame -q:a 6 "$out" 2>/tmp/err_$k; then
    # measure mean volume
    mv=$(ffmpeg -hide_banner -i "$out" -af volumedetect -f null /dev/null 2>&1 | grep mean_volume | sed 's/.*mean_volume: //')
    sz=$(stat -c%s "$out")
    echo "$k  size=${sz}B  mean=${mv}"
  else
    echo "$k  FAILED: $(cat /tmp/err_$k | tail -1)"
  fi
done
rm -rf "$TMP"

#!/bin/bash
# 引数でメッセージを渡せるようにする
git add -A
git commit -m "$1"
git push origin HEAD
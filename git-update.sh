#!/bin/bash
# 全ファイルをステージングして "更新" でコミット＆push

git add -A
git commit -m "更新"
git push origin main
git push

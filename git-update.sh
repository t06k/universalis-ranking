#!/bin/bash
# 全ファイルをステージングして "更新" でコミット＆push
git branch
git add -A
git commit -m "更新"
git push origin main

# #!/bin/bash
# # 引数でメッセージを渡せるようにする
# git add -A
# git commit -m "$1"
# git push origin HEAD
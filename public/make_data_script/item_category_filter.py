import csv

# 読み込むCSVファイル名と出力するCSVファイル名
INPUT_FILE = 'item.csv'
OUTPUT_FILE = 'filtered_item_category_data.csv'

# 抽出したい項目のインデックス (0から始まる)
# 項目名:           key, ItemSearchCategory, CanBeHq
# 元のCSVのインデックス: 0, 17,               28
TARGET_INDICES = [0, 17, 28]

def extract_and_create_csv(input_path, output_path, indices):
    """
    指定されたインデックスの列を抽出し、新しいCSVファイルを作成します。
    """
    print(f"ファイル {input_path} からデータを読み込んでいます...")
    
    try:
        with open(input_path, 'r', newline='', encoding='utf-8') as infile:
            reader = csv.reader(infile)
            
            # ヘッダー行を含め、抽出する行を格納するリスト
            filtered_rows = []
            
            # データの処理
            for i, row in enumerate(reader):
                # 必要な列だけを抽出
                new_row = [row[j] for j in indices]
                filtered_rows.append(new_row)
            
        # 新しいCSVファイルに書き込み
        with open(output_path, 'w', newline='', encoding='utf-8') as outfile:
            writer = csv.writer(outfile)
            writer.writerows(filtered_rows)
            
        print(f"抽出が完了しました。新しいファイル '{output_path}' が作成されました。")

    except FileNotFoundError:
        print(f"エラー: ファイル '{input_path}' が見つかりません。ファイル名を確認してください。")
    except IndexError:
        print("エラー: 元のCSVの列数が不足しています。インデックスを確認してください。")
    except Exception as e:
        print(f"予期せぬエラーが発生しました: {e}")
        # スクリプトの実行
extract_and_create_csv(INPUT_FILE, OUTPUT_FILE, TARGET_INDICES)
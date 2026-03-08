#!/usr/bin/env python3
import os
os.environ['PATH'] = '/home/xhen/miniconda3/envs/GPTSoVits/bin:' + os.environ.get('PATH', '')
os.environ['PATH'] = '/home/xhen/miniconda3/envs/GPTSoVits/bin'

import sys
import whisper
model = whisper.load_model('base')
result = model.transcribe(sys.argv[1], language='zh')
print(result['text'])

"""Fast, conservative layout: keep characters and existing punctuation intact."""
import re,unicodedata

def characters(text):
    return ''.join(c for c in text if not c.isspace() and not unicodedata.category(c).startswith(('P','Z')))

def organize_text(text):
    paragraphs=[];pending=''
    for line in text.replace('\r\n','\n').split('\n'):
        line=line.strip()
        if not line:
            if pending:paragraphs.append(pending);pending=''
            continue
        pending+=line
        # Only use punctuation already in the source as a sentence boundary.
        if re.search(r'[。！？!?][」』）)]?$',pending):
            paragraphs.append(pending);pending=''
    if pending:
        if not re.search(r'[。！？!?][」』）)]?$',pending):pending+='。'
        paragraphs.append(pending)
    output='\n\n'.join(paragraphs)
    if characters(output)!=characters(text):raise ValueError('整理改变了字词，保留原稿')
    return output

"""Shared image validation for GESP and physics chat."""
import base64
import binascii
import re
from .model import GenerationError


def chat_attachments(message):
    images=message.get('attachments',[])
    if not isinstance(images,list) or len(images)>3 or (images and message['role']!='user'):
        raise GenerationError('invalid_images','仅用户消息可以附带图片，每次最多 3 张。')
    checked=[]
    for image in images:
        if not isinstance(image,dict): raise GenerationError('invalid_images','图片格式无效。')
        url=image.get('dataUrl','')
        if not isinstance(url,str) or len(url)>2800000:
            raise GenerationError('invalid_images','每张图片不能超过 2 MiB。')
        match=re.fullmatch(r'data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})',url)
        if not match: raise GenerationError('invalid_images','仅支持 PNG、JPEG、WebP 图片。')
        try: raw=base64.b64decode(match[2],validate=True)
        except (ValueError,binascii.Error): raise GenerationError('invalid_images','图片编码无效。') from None
        valid={'png':raw.startswith(b'\x89PNG\r\n\x1a\n'),'jpeg':raw.startswith(b'\xff\xd8\xff'),'webp':raw[:4]==b'RIFF' and raw[8:12]==b'WEBP'}[match[1]]
        if not valid or not 12<=len(raw)<=2*1024*1024: raise GenerationError('invalid_images','图片内容或大小无效。')
        name=image.get('name','提问图片')
        if not isinstance(name,str) or len(name)>100: raise GenerationError('invalid_images','图片名称无效。')
        checked.append(dict(dataUrl=url,name=name))
    return checked

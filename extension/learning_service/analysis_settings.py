"""Machine-local teaching controls; credentials are never included in public settings."""
import hashlib,hmac,json,secrets,threading,time
from pathlib import Path
from .model import ROOT,GenerationError

class AnalysisSettings:
    def __init__(self,data_dir):
        self.path=Path(data_dir)/'analysis-settings.json';self.lock=threading.RLock()
        if self.path.exists():self.value=json.loads(self.path.read_text(encoding='utf-8'))
        else:self.value=json.loads((ROOT/'learning_service/config.json').read_text(encoding='utf-8'))['codeAnalysis'].copy()
        self.validate(self.value)
    @staticmethod
    def validate(value):
        for name,limit in [('dailyMinutes',720),('failedChanges',100)]:
            if type(value.get(name))!=int or not 1<=value[name]<=limit:raise GenerationError('analysis_settings',f'{name} 必须为 1～{limit} 的整数。')
    def public(self):
        with self.lock:return dict(scope='day',dailyMinutes=self.value['dailyMinutes'],failedChanges=self.value['failedChanges'])
    def verify(self,password):
        if not isinstance(password,str) or not 1<=len(password)<=128:return False
        with self.lock:
            if self.value.get('passwordSalt'):
                actual=hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(self.value['passwordSalt']),180000).hex()
                expected=self.value['passwordHash']
            else:actual=hashlib.sha256(password.encode()).hexdigest();expected=self.value['passwordSha256']
            return hmac.compare_digest(actual,expected)
    def require_password(self,password):
        if not self.verify(password):raise GenerationError('analysis_password','密码不正确，请重新输入。')
    def update(self,body):
        with self.lock:
            self.require_password(body.get('currentPassword'))
            updated={**self.value,'dailyMinutes':body.get('dailyMinutes'),'failedChanges':body.get('failedChanges')}
            self.validate(updated)
            password=body.get('newPassword','')
            if not isinstance(password,str) or len(password)>128 or (password and len(password)<6):raise GenerationError('analysis_settings','新密码须为 6～128 个字符，留空则保留当前密码。')
            if password:
                salt=secrets.token_bytes(16);updated.pop('passwordSha256',None)
                updated.update(passwordSalt=salt.hex(),passwordHash=hashlib.pbkdf2_hmac('sha256',password.encode(),salt,180000).hex())
            updated['updatedAt']=time.time()
            temporary=self.path.with_suffix('.tmp');temporary.write_text(json.dumps(updated,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(self.path)
            self.value=updated
            return self.public()

import math, wave, struct, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
rate=22050
def make(path,notes,length):
    path.parent.mkdir(parents=True,exist_ok=True)
    data=[]
    for i in range(int(rate*length)):
        t=i/rate; v=0.0
        for start,dur,hz,amp in notes:
            x=t-start
            if 0<=x<dur:
                env=min(1,x/.035)*min(1,(dur-x)/.09)*math.exp(-2.6*x/dur)
                v+=amp*env*(math.sin(2*math.pi*hz*x)+.24*math.sin(2*math.pi*2*hz*x)+.09*math.sin(2*math.pi*3*hz*x))
        data.append(struct.pack('<h',int(max(-.93,min(.93,v))*32767)))
    with wave.open(str(path),'wb') as w:w.setparams((1,2,rate,0,'NONE','not compressed'));w.writeframes(b''.join(data))
notes=[]
for start,hz in [(0,523.25),(.22,659.25),(.44,783.99),(.76,659.25),(1.05,587.33),(1.27,698.46),(1.49,880),(1.8,783.99)]:
    notes.extend([(start,.40,hz,.43),(start+.07,.43,hz/2,.09)])
make(root/'public/sounds/vexa-ring141.wav',notes,3.2)
make(root/'android/app/src/main/res/raw/vexa_ring141.wav',notes,3.2)
make(root/'public/sounds/vexa-ringback141.wav',[(0,.8,392,.20),(0,.8,493.88,.15),(.99,.8,392,.20),(.99,.8,493.88,.15)],3.6)

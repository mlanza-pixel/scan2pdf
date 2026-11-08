from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
r=Path(__file__).parent/'fixtures';r.mkdir(exist_ok=True)
f='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for i,title in enumerate(['RECEIPT','MEETING NOTES','DELIVERY CHECKLIST'],1):
 im=Image.new('RGB',(1200,1600),'#ffffff');d=ImageDraw.Draw(im)
 d.rectangle((65,65,1135,1535),outline='#36617b',width=5)
 d.text((110,130),title,font=ImageFont.truetype(f,52),fill='#16394b')
 lines=[f'DocuScan 7.6 test photo {i}','Synthetic test document - no personal data','Date: November 4, 2026','Reference: QA-760-'+str(i),'Item one: confirm image clarity','Item two: confirm all pages are included','Total: 125.00 USD','APPROVED FOR TESTING']
 for j,t in enumerate(lines):d.text((110,290+j*115),t,font=ImageFont.truetype(f,30),fill='#222222')
 im.save(r/f'photo-{i}.jpg',quality=92)
for count in [10,5]:
 c=canvas.Canvas(str(r/f'document-{count}-pages.pdf'),pagesize=letter)
 for i in range(1,count+1):
  c.setFont('Helvetica-Bold',22);c.drawString(50,730,f'DocuScan test: {count}-page PDF')
  c.setFont('Helvetica',15);c.drawString(50,690,f'PAGE {i} OF {count}');c.drawString(50,650,f'Unique marker: DOC{count}-PAGE{i:02d}')
  for j in range(8):c.drawString(50,600-j*35,f'Test line {j+1}: merge, rotate, split, sign and preserve text.')
  c.rect(50,60,512,650);c.showPage()
 c.save()

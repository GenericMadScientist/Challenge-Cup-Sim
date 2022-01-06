from PIL import Image

sheet = Image.new('RGBA', (16128, 128), 0)
egg = Image.open('sprites/egg.png')
sheet.paste(egg, (0, 0, 64, 64))
sheet.paste(egg, (0, 64, 64, 128))
for i in range(1, 252):
    normal = Image.open(f'sprites/normal/{i:03}.png')
    shiny = Image.open(f'sprites/shiny/{i:03}.png')
    if normal.size == (64, 64):
        sheet.paste(normal, (i * 64, 0, (i + 1) * 64, 64))
    elif normal.size == (60, 60):
        sheet.paste(normal, (i * 64 + 2, 2, (i + 1) * 64 - 2, 62))
        print(f'Weird normal {i}')
    else:
        print(f'Very weird normal {i}')
    
    if shiny.size == (64, 64):
        sheet.paste(shiny, (i * 64, 64, (i + 1) * 64, 128))
    elif shiny.size == (60, 60):
        sheet.paste(shiny, (i * 64 + 2, 66, (i + 1) * 64 - 2, 126))
        print(f'Weird shiny {i}')
    else:
        print(f'Very weird shiny {i}')

sheet.save('sprites.png')

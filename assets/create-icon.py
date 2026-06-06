"""
Script para gerar o icon.ico do FlightLog.
Requer: pip install Pillow
Execute: python assets/create-icon.py
"""
from PIL import Image, ImageDraw
import os

def create_icon():
    sizes = [256, 128, 64, 48, 32, 16]
    images = []

    for size in sizes:
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Fundo circular azul escuro
        margin = size // 10
        draw.ellipse(
            [margin, margin, size - margin, size - margin],
            fill=(12, 31, 61, 255)   # #0c1f3d
        )

        # Avião simplificado (triângulo + cauda)
        cx, cy = size // 2, size // 2
        scale = size / 256

        # Corpo (triângulo apontando para cima-direita)
        body = [
            (cx + int(80 * scale), cy - int(10 * scale)),   # ponta direita
            (cx - int(70 * scale), cy - int(30 * scale)),   # asa esquerda
            (cx - int(40 * scale), cy + int(15 * scale)),   # base
        ]
        draw.polygon(body, fill=(96, 165, 250, 255))  # #60a5fa

        # Asa
        wing = [
            (cx - int(10 * scale), cy - int(5 * scale)),
            (cx - int(60 * scale), cy + int(50 * scale)),
            (cx + int(20 * scale), cy + int(20 * scale)),
        ]
        draw.polygon(wing, fill=(59, 130, 246, 255))  # #3b82f6

        images.append(img)

    out_path = os.path.join(os.path.dirname(__file__), 'icon.ico')
    images[0].save(
        out_path,
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=images[1:]
    )
    print(f"Ícone criado em: {out_path}")

if __name__ == '__main__':
    create_icon()

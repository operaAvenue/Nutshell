import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original = content
    
    # Simple replaces
    content = content.replace('cyan-400', 'accent-400')
    content = content.replace('cyan-500', 'accent-500')
    content = content.replace('cyan-600', 'accent-600')
    content = content.replace('cyan-900', 'accent-900')
    content = content.replace('cyan-950', 'accent-950')
    content = content.replace('cyan-450', 'accent-400')

    # Specific shadows
    # rgba(6,182,212,0.15) -> var(--color-accent-500) or similar.
    # Actually, if I just replace rgba(6,182,212,X) with var(--color-accent-500) it won't work well without color-mix.
    # But wait, tailwind supports `shadow-[0_0_15px_var(--color-accent-glow)]`! Let's define --accent-glow in themes.
    # I'll just replace rgba(6,182,212,...) with var(--color-accent-glow)
    content = re.sub(r'rgba\(6,\s*182,\s*212,\s*[0-9.]+\)', 'var(--color-accent-glow)', content)

    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('src/components'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            process_file(os.path.join(root, file))

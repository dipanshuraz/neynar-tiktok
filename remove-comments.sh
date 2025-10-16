#!/bin/bash
# Remove unnecessary comments from source files
# Keep only: critical logic, performance notes, TODO/FIXME

FILES=$(find src/app/components src/app/hooks src/app/utils src/app/api src/app/config -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null)

for file in $FILES; do
  if [ -f "$file" ]; then
    # Create backup
    cp "$file" "$file.bak"
    
    # Remove simple explanatory comments like "// Clean up", "// Save to storage", etc.
    # But keep complex logic comments and dev-only checks
    sed -i '' -E '
      # Remove file header comments
      /^\/\/ src\//d
      # Remove simple action comments  
      /^[[:space:]]*\/\/ (Initialize|Save|Load|Fetch|Set|Get|Create|Update|Delete|Add|Remove|Clear|Reset|Check|Validate|Format|Convert|Parse|Build|Start|Stop|Pause|Play|Toggle|Show|Hide|Close|Open) /d
      # Remove section comments
      /^[[:space:]]*\/\/ ---/d
      # Remove performance optimization headers
      /PERFORMANCE OPTIMIZED/d
    ' "$file"
    
    echo "Cleaned: $file"
  fi
done

echo "Done! Backups saved with .bak extension"

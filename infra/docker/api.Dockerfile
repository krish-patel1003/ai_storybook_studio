FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/base.txt requirements/base.txt
RUN pip install --no-cache-dir -r requirements/base.txt

# Bundle all story fonts for PDF/EPUB export
COPY fonts/Fredoka-Bold.ttf         /usr/share/fonts/truetype/Fredoka-Bold.ttf
COPY fonts/Nunito-Regular.ttf       /usr/share/fonts/truetype/Nunito-Regular.ttf
COPY fonts/Nunito-Bold.ttf          /usr/share/fonts/truetype/Nunito-Bold.ttf
COPY fonts/PatrickHand-Regular.ttf  /usr/share/fonts/truetype/PatrickHand-Regular.ttf
COPY fonts/Merriweather-Regular.ttf /usr/share/fonts/truetype/Merriweather-Regular.ttf
COPY fonts/Quicksand-Regular.ttf    /usr/share/fonts/truetype/Quicksand-Regular.ttf
COPY fonts/Caveat-Regular.ttf       /usr/share/fonts/truetype/Caveat-Regular.ttf
COPY fonts/Unkempt-Regular.ttf      /usr/share/fonts/truetype/Unkempt-Regular.ttf
COPY fonts/Unkempt-Bold.ttf         /usr/share/fonts/truetype/Unkempt-Bold.ttf
COPY fonts/Kranky-Regular.ttf       /usr/share/fonts/truetype/Kranky-Regular.ttf

COPY . .

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "300"]

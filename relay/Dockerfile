FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . ./relay/

EXPOSE 8600
ENV PORT=8600

CMD ["python", "-m", "relay"]

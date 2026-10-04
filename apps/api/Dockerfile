FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY opsdesk ./opsdesk
RUN useradd --create-home --uid 10001 opsdesk
USER opsdesk
EXPOSE 8000
CMD ["uvicorn", "opsdesk.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]

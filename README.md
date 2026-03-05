# Neural Eco Render

NeuralEcoRender is a deep learning system that reconstructs high-quality rendered frames from low-sample inputs while estimating rendering cost, energy consumption, and CO₂ emissions.

The project explores how AI can improve both rendering efficiency and environmental sustainability.

## Features

• Neural network for frame reconstruction  
• Residual CNN architecture (PyTorch)  
• Rendering cost simulation  
• Energy and CO₂ estimation  
• Confidence and error visualization  
• Flask backend API

## Tech Stack

Python  
PyTorch  
Flask  
OpenCV  
NumPy  
HTML / CSS / JavaScript

## Project Structure

app.py — Flask backend  
model.py — Neural network architecture  
train.py — training pipeline  
data_loader.py — frame loading utilities  
render_cost.py — render energy calculations  

Frontend:
index.html  
style.css  
app.js

## Run the Project

Install dependencies:

pip install -r requirements.txt

Run backend:

python app.py

Then open:

http://127.0.0.1:5000

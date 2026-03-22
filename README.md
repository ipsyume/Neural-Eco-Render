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

<img width="1918" height="976" alt="image" src="https://github.com/user-attachments/assets/bdf36bb2-a239-4342-a06c-47de1e26e07e" />
<img width="1910" height="663" alt="image" src="https://github.com/user-attachments/assets/6da3645d-2f95-4137-b2af-2a58a55b625d" />
<img width="1625" height="718" alt="image" src="https://github.com/user-attachments/assets/9fb01ff6-c23e-4d56-81b1-f5ea9a1c0b67" />


![demo](https://github.com/user-attachments/assets/6ad3e49c-f1c2-4077-955d-965c1eeb2555)





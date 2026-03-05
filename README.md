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

<img width="1919" height="960" alt="image" src="https://github.com/user-attachments/assets/d377832c-38ef-420b-a94c-85cb51fdc5eb" />
<img width="1911" height="965" alt="image" src="https://github.com/user-attachments/assets/18982da9-8abc-4592-b7ef-f65acc32365f" />
<img width="1919" height="888" alt="image" src="https://github.com/user-attachments/assets/887d0674-756a-4936-9921-ae463d993f54" />
<img width="1444" height="943" alt="image" src="https://github.com/user-attachments/assets/d3b8977d-ceca-435a-9cb1-05140cb21fb0" />




